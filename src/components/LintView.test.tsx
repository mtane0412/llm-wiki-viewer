import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { LintView } from './LintView'

/** 未作成のページ「RAG」へ 2 ページから、「ベクトル DB」へ 1 ページからリンクしている Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/index.md', content: '- [[concepts/agent]]\n- [[RAG]]' },
    { path: 'wiki/concepts/agent.md', content: '---\ntitle: エージェント\n---\n[[RAG]] と [[ベクトル DB]] を使う。' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

describe('LintView の未作成ページ（赤リンク）', () => {
  it('未作成のリンク先を参照数の多い順に、参照数とともに表示する', () => {
    render(<LintView index={index} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /未作成ページ/ })
    expect(within(section).getAllByRole('code').map((target) => target.textContent)).toEqual(['RAG', 'ベクトル DB'])
    // 参照数は、リンク先の文字列と同じ項目の中に表示します
    expect(within(section).getAllByRole('code')[0].closest('li')).toHaveTextContent('2 ページ')
    expect(within(section).getAllByRole('code')[1].closest('li')).toHaveTextContent('1 ページ')
  })

  it('各リンク先から参照元のページへ移動できる', () => {
    render(<LintView index={index} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /未作成ページ/ })
    expect(within(section).getAllByRole('link', { name: 'エージェント' })[0]).toHaveAttribute('href', '#/v1/page/wiki/concepts/agent.md')
    expect(within(section).getByRole('link', { name: 'index' })).toHaveAttribute('href', '#/v1/page/wiki/index.md')
  })
})

describe('LintView の index.md 未掲載', () => {
  it('index.md からリンクされていないページを表示する', () => {
    render(<LintView index={index} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /index\.md 未掲載/ })
    // 前提: index.md は agent にリンクしているため、未掲載のページはありません
    expect(within(section).getByText('指摘はありません。')).toBeInTheDocument()
  })

  it('index.md が無い Wiki では、判定できないことを明示する', () => {
    const noIndex = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/concepts/agent.md', content: '---\ntitle: エージェント\n---\n本文' }],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    render(<LintView index={noIndex} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /index\.md 未掲載/ })
    expect(within(section).getByText(/index\.md が見つからないため、判定していません/)).toBeInTheDocument()
    expect(within(section).queryByText('指摘はありません。')).toBeNull()
    // 判定していない区画では、件数を 0 と表示しません
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('index.md 未掲載 —')
  })

  it('未掲載のページへ移動できる', () => {
    const partial = buildWikiIndex({
      markdownFiles: [
        { path: 'wiki/index.md', content: '[[concepts/agent]]' },
        { path: 'wiki/concepts/agent.md', content: '[[concepts/memory]]' },
        { path: 'wiki/overview.md', content: '[[concepts/memory]]' },
        { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\n---\n本文' },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    render(<LintView index={partial} vaultId="v1" />)
    const section = screen.getByRole('region', { name: /index\.md 未掲載/ })
    expect(within(section).getByRole('link', { name: '記憶' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/memory.md')
  })
})
