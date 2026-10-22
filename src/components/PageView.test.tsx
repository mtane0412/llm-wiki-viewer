import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { PageView } from './PageView'

/** 見出しを複数持つ長いページと、見出しの無い短いページを含む Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    {
      path: 'wiki/concepts/llm-wiki.md',
      content: '---\ntitle: LLM Wiki\n---\n# LLM Wiki\n\n## 取り込み（ingest）\n\n### 要約の作り方\n\n## 点検（lint）',
    },
    { path: 'wiki/concepts/短いメモ.md', content: '見出しの無い短いメモです。' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

/** 指定したページを表示するヘルパーです。 */
function renderPage(path: string, heading?: string) {
  const page = index.pageByPath.get(path)
  if (!page) throw new Error(`テストデータにページがありません: ${path}`)
  render(<PageView page={page} index={index} vaultId="v1" heading={heading} readBlob={vi.fn()} />)
}

describe('PageView の目次', () => {
  beforeEach(() => {
    // jsdom には scrollIntoView が無いため、見出しへのスクロールを何もしない関数に置き換えます
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('見出しの一覧を目次として表示し、各項目は見出しつきのページ URL を指す', () => {
    renderPage('wiki/concepts/llm-wiki.md')
    const toc = screen.getByRole('navigation', { name: '目次' })
    const links = within(toc).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['LLM Wiki', '取り込み（ingest）', '要約の作り方', '点検（lint）'])
    expect(within(toc).getByRole('link', { name: '要約の作り方' })).toHaveAttribute(
      'href',
      `#/v1/page/wiki/concepts/llm-wiki.md?h=${encodeURIComponent('要約の作り方')}`,
    )
  })

  it('目次の項目は、本文の同じ見出しの id と一致する', () => {
    renderPage('wiki/concepts/llm-wiki.md')
    const toc = screen.getByRole('navigation', { name: '目次' })
    // 目次の URL の見出し（?h=）で、本文の見出し要素を id から引けることを確かめます
    for (const link of within(toc).getAllByRole('link')) {
      const heading = new URLSearchParams(link.getAttribute('href')?.split('?')[1]).get('h')
      expect(document.getElementById(heading ?? '')).toHaveTextContent(link.textContent ?? '')
    }
  })

  it('見出しの階層を目次の項目の段に反映する', () => {
    renderPage('wiki/concepts/llm-wiki.md')
    const toc = screen.getByRole('navigation', { name: '目次' })
    expect(within(toc).getByRole('link', { name: '要約の作り方' }).closest('li')).toHaveAttribute('data-depth', '3')
    expect(within(toc).getByRole('link', { name: '点検（lint）' }).closest('li')).toHaveAttribute('data-depth', '2')
  })

  it('表示中の見出しの項目を現在位置として示す', () => {
    renderPage('wiki/concepts/llm-wiki.md', '点検（lint）')
    const toc = screen.getByRole('navigation', { name: '目次' })
    expect(within(toc).getByRole('link', { name: '点検（lint）' })).toHaveAttribute('aria-current', 'location')
    expect(within(toc).getByRole('link', { name: '要約の作り方' })).not.toHaveAttribute('aria-current')
  })

  it('表示中の見出しの項目をもう一度押すと、URL が変わらなくてもその見出しへスクロールする', async () => {
    renderPage('wiki/concepts/llm-wiki.md', '点検（lint）')
    // 前提: 最初の表示で見出しへスクロールした記録を消し、読者が手で別の位置へスクロールした状態にします
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
    const toc = screen.getByRole('navigation', { name: '目次' })
    await userEvent.click(within(toc).getByRole('link', { name: '点検（lint）' }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0]).toBe(document.getElementById('点検（lint）'))
  })

  it('見出しが無いページでは目次を表示しない', () => {
    renderPage('wiki/concepts/短いメモ.md')
    expect(screen.queryByRole('navigation', { name: '目次' })).toBeNull()
  })
})

describe('PageView の根拠としての被参照', () => {
  /** ソース要約ページ「Codex リポジトリ」を、tool-use が sources で根拠にし、index が本文でリンクしている Wiki です。 */
  const sourceWiki = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/index.md', content: '---\ntitle: Index\n---\n- [[sources/codex-repo]]' },
      { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\nsources: ["[[sources/codex-repo]]"]\n---\n本文' },
      { path: 'wiki/sources/codex-repo.md', content: '---\ntitle: Codex リポジトリ\ntype: source\n---\n要約' },
      { path: 'wiki/sources/未参照のソース.md', content: '---\ntitle: 未参照のソース\ntype: source\n---\n要約' },
      { path: 'wiki/analyses/比較.md', content: '---\ntitle: 比較\nsources: ["[[concepts/tool-use]]"]\n---\n本文' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })

  /** 指定したページを表示するヘルパーです。 */
  function renderSourcePage(path: string) {
    const page = sourceWiki.pageByPath.get(path)
    if (!page) throw new Error(`テストデータにページがありません: ${path}`)
    render(<PageView page={page} index={sourceWiki} vaultId="v1" heading={undefined} readBlob={vi.fn()} />)
  }

  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

  it('ソース要約ページでは、sources で根拠にしているページを本文のバックリンクと分けて表示する', () => {
    renderSourcePage('wiki/sources/codex-repo.md')
    const citations = screen.getByRole('region', { name: 'このソースを根拠にしているページ' })
    expect(within(citations).getByRole('link', { name: 'ツール使用' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/tool-use.md')
    expect(within(citations).queryByRole('link', { name: 'Index' })).toBeNull()

    const backlinks = screen.getByRole('region', { name: 'バックリンク' })
    expect(within(backlinks).getByRole('link', { name: 'Index' })).toBeInTheDocument()
    expect(within(backlinks).queryByRole('link', { name: 'ツール使用' })).toBeNull()
  })

  it('根拠にしているページが無いソース要約ページでは、その旨を表示する', () => {
    renderSourcePage('wiki/sources/未参照のソース.md')
    const citations = screen.getByRole('region', { name: 'このソースを根拠にしているページ' })
    expect(within(citations).getByText('このソースを sources に挙げているページはありません。')).toBeInTheDocument()
  })

  it('ソース要約ではないページが sources で参照されている場合は、「このページを根拠にしているページ」として表示する', () => {
    renderSourcePage('wiki/concepts/tool-use.md')
    expect(screen.queryByRole('region', { name: 'このソースを根拠にしているページ' })).toBeNull()
    const citations = screen.getByRole('region', { name: 'このページを根拠にしているページ' })
    expect(within(citations).getByRole('link', { name: '比較' })).toBeInTheDocument()
  })

  it('ソース要約ではなく、根拠としても参照されていないページでは表示しない', () => {
    renderSourcePage('wiki/analyses/比較.md')
    expect(screen.queryByRole('region', { name: /を根拠にしているページ/ })).toBeNull()
  })
})

describe('PageView のタグと type', () => {
  it('タグと type を、それぞれで絞り込んだページ一覧へのリンクとして表示する', () => {
    const tagged = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\ntype: concept\ntags: [agent]\n---\n本文' }],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    const page = tagged.pageByPath.get('wiki/concepts/tool-use.md')
    if (!page) throw new Error('テストデータにページがありません')
    window.scrollTo = vi.fn()
    render(<PageView page={page} index={tagged} vaultId="v1" heading={undefined} readBlob={vi.fn()} />)
    expect(screen.getByRole('link', { name: '#agent' })).toHaveAttribute('href', '#/v1/tag/agent')
    expect(screen.getByRole('link', { name: 'concept' })).toHaveAttribute('href', '#/v1/type/concept')
  })
})
