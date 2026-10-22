import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { MarkdownView } from './MarkdownView'

const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/index.md', content: '# 目次' },
    { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: Tool use\n---\n本文' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: ['raw/assets/diagram.png'],
})

/** テスト対象を描画し、描画先の要素を返すヘルパーです（callout の枠など、ロールの無い要素を確かめるために使います）。 */
function renderMarkdownWithContainer(markdown: string) {
  const readBlob = vi.fn(async () => new Blob(['PNG'], { type: 'image/png' }))
  return render(<MarkdownView markdown={markdown} index={index} pagePath="wiki/index.md" vaultId="v1" readBlob={readBlob} />)
}

/** テスト対象を描画するヘルパーです。 */
function renderMarkdown(markdown: string) {
  const readBlob = vi.fn(async () => new Blob(['PNG'], { type: 'image/png' }))
  render(<MarkdownView markdown={markdown} index={index} pagePath="wiki/index.md" vaultId="v1" readBlob={readBlob} />)
  return { readBlob }
}

describe('MarkdownView', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:diagram')
    URL.revokeObjectURL = vi.fn()
  })

  it('wikilink をページへのリンクにし、表示名が無ければタイトルを表示する', () => {
    renderMarkdown('参照: [[concepts/tool-use]]')
    expect(screen.getByRole('link', { name: 'Tool use' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/tool-use.md')
  })

  it('表示名と見出しつきの wikilink を描画する', () => {
    renderMarkdown('[[concepts/tool-use#承認|ツールの承認]]')
    expect(screen.getByRole('link', { name: 'ツールの承認' })).toHaveAttribute(
      'href',
      `#/v1/page/wiki/concepts/tool-use.md?h=${encodeURIComponent('承認')}`,
    )
  })

  it('表の中でエスケープされた wikilink も描画する', () => {
    renderMarkdown('| 列 |\n|---|\n| [[concepts/tool-use\\|ツール]] |')
    expect(screen.getByRole('link', { name: 'ツール' })).toBeInTheDocument()
  })

  it('解決できない wikilink は壊れたリンクとして表示する', () => {
    renderMarkdown('[[存在しないページ]]')
    const broken = screen.getByText('存在しないページ')
    expect(broken).toHaveClass('wikilink-broken')
    expect(broken).toHaveAttribute('title', 'リンク先が見つかりません: 存在しないページ')
  })

  it('コードの中の [[...]] はリンクにしない', () => {
    renderMarkdown('`[[concepts/tool-use]]`')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('[[concepts/tool-use]]')).toBeInTheDocument()
  })

  it('画像の埋め込み ![[...]] はフォルダ内のファイルを読み込んで表示する', async () => {
    const { readBlob } = renderMarkdown('![[diagram.png]]')
    await waitFor(() => expect(screen.getByRole('img', { name: 'diagram.png' })).toHaveAttribute('src', 'blob:diagram'))
    expect(readBlob).toHaveBeenCalledWith('raw/assets/diagram.png')
  })

  it('通常の Markdown リンクで書いた相対パスの .md もページへのリンクにする', () => {
    renderMarkdown('[ツール](concepts/tool-use.md)')
    expect(screen.getByRole('link', { name: 'ツール' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/tool-use.md')
  })

  it('外部リンクは新しいタブで開く', () => {
    renderMarkdown('[公式](https://example.com)')
    const link = screen.getByRole('link', { name: '公式' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('外部 URL の画像は読み込まず、リンクとして表示する', () => {
    renderMarkdown('![追跡用の画像](https://tracker.example.com/pixel.png)')
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('link', { name: '追跡用の画像' })).toHaveAttribute('href', 'https://tracker.example.com/pixel.png')
  })

  it('見出しに見出しの文字列を id として付ける', () => {
    renderMarkdown('## 承認の仕組み')
    expect(screen.getByRole('heading', { name: '承認の仕組み' })).toHaveAttribute('id', '承認の仕組み')
  })

  it('callout を種類つきの枠として描画し、タイトルと本文（wikilink を含む）を分ける', () => {
    const { container } = renderMarkdownWithContainer('> [!warning] 矛盾\n> [[concepts/tool-use]] では X とされている。')
    const callout = container.querySelector('[data-callout="warning"]')
    expect(callout).toHaveClass('callout', 'callout-warning')
    expect(callout?.querySelector('.callout-title')).toHaveTextContent('矛盾')
    const content = callout?.querySelector('.callout-content')
    expect(content).toHaveTextContent('Tool use では X とされている。')
    expect(screen.getByRole('link', { name: 'Tool use' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/tool-use.md')
  })

  it('別名の種類は正規の種類の見た目にし、タイトルが無ければ種類の名前を表示する', () => {
    const { container } = renderMarkdownWithContainer('> [!FAQ]\n> 推測による記述。')
    const callout = container.querySelector('.callout')
    expect(callout).toHaveClass('callout-question')
    expect(callout?.querySelector('.callout-title')).toHaveTextContent('Faq')
  })

  it('未知の種類の callout は既定の見た目で描画する', () => {
    const { container } = renderMarkdownWithContainer('> [!仮説] 検証待ち\n> 本文')
    const callout = container.querySelector('[data-callout="仮説"]')
    expect(callout).toHaveClass('callout', 'callout-default')
    expect(callout?.querySelector('.callout-title')).toHaveTextContent('検証待ち')
  })

  it('callout の記法ではない引用はそのまま引用として描画する', () => {
    const { container } = renderMarkdownWithContainer('> ふつうの引用')
    expect(container.querySelector('blockquote')).toHaveTextContent('ふつうの引用')
    expect(container.querySelector('.callout')).toBeNull()
  })
})
