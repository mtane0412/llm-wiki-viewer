import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { PageView } from './PageView'

/** 3 件のエントリと、形式に合わない見出し 1 件を含む log.md を持つ Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    {
      path: 'wiki/log.md',
      content: [
        '# 作業ログ',
        '',
        '## [2026-10-14] ingest | Codex リポジトリ',
        '',
        '- 作成: [[concepts/tool-use]]',
        '',
        '## 2026-10-15 query ツールの承認方式',
        '',
        '## [2026-10-16] lint | 孤立ページの解消',
        '',
        '- 修正: [[concepts/tool-use]]',
        '',
        '## [2026-10-16] ingest | Claude Code のドキュメント',
      ].join('\n'),
    },
    { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\n---\n本文' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

/** log.md を表示するヘルパーです。 */
function renderLog() {
  const page = index.pageByPath.get('wiki/log.md')
  if (!page) throw new Error('テストデータに log.md がありません')
  render(<PageView page={page} index={index} vaultId="v1" heading={undefined} readBlob={vi.fn()} />)
  return screen.getByRole('list', { name: 'タイムライン' })
}

/** タイムラインに表示されているエントリのタイトルを、表示順に返します。 */
function titlesIn(timeline: HTMLElement): string[] {
  return within(timeline)
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent ?? '')
}

describe('log.md のタイムライン', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

  it('エントリを新しい日付から順に、日付と種類とともに表示する', () => {
    const timeline = renderLog()
    // 同じ日付のエントリは、後から追記したものを先に表示します
    expect(titlesIn(timeline)).toEqual(['Claude Code のドキュメント', '孤立ページの解消', 'Codex リポジトリ'])
    const first = within(timeline).getAllByRole('listitem')[0]
    expect(within(first).getByText('2026-10-16').tagName).toBe('TIME')
    expect(within(first).getByText('ingest')).toBeInTheDocument()
  })

  it('エントリの本文の wikilink から、作成・更新したページへ移動できる', () => {
    const timeline = renderLog()
    expect(within(timeline).getAllByRole('link', { name: 'ツール使用' })[0]).toHaveAttribute('href', '#/v1/page/wiki/concepts/tool-use.md')
  })

  it('形式に合わない見出しは、解析エラーとしてタイムラインと区別して示す', () => {
    renderLog()
    const invalid = screen.getByRole('region', { name: /形式に合わない見出し/ })
    expect(within(invalid).getByText('2026-10-15 query ツールの承認方式')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'タイムライン' })).queryByText(/ツールの承認方式/)).toBeNull()
  })

  it('種類のチェックを外すと、その種類のエントリを隠す', async () => {
    const timeline = renderLog()
    await userEvent.click(screen.getByRole('checkbox', { name: /ingest/ }))
    expect(titlesIn(timeline)).toEqual(['孤立ページの解消'])
  })

  it('絞り込みの選択肢に、種類ごとの件数を表示する', () => {
    renderLog()
    expect(screen.getByRole('checkbox', { name: 'ingest 2' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'lint 1' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'query 0' })).toBeChecked()
  })
})
