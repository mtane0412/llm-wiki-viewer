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
