import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { PagesByTagView, PagesByTypeView, TaxonomyView } from './TaxonomyView'

/** タグと type を持つページで構成した Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\ntype: concept\ntags: [agent, AI/LLM]\n---\n本文' },
    { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\ntype: concept\ntags: [agent]\n---\n本文' },
    { path: 'wiki/sources/codex.md', content: '---\ntitle: Codex リポジトリ\ntype: source\n---\n本文' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

describe('TaxonomyView', () => {
  it('type の一覧を件数とともに表示し、type ごとのページ一覧へ移動できる', () => {
    render(<TaxonomyView index={index} vaultId="v1" />)
    const types = screen.getByRole('region', { name: 'type' })
    const concept = within(types).getByRole('link', { name: /concept/ })
    expect(concept).toHaveAttribute('href', '#/v1/type/concept')
    expect(concept).toHaveTextContent('concept2')
  })

  it('タグの一覧を件数の多い順に表示し、タグごとのページ一覧へ移動できる', () => {
    render(<TaxonomyView index={index} vaultId="v1" />)
    const tags = screen.getByRole('region', { name: 'タグ' })
    const links = within(tags).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['#agent2', '#AI/LLM1'])
    expect(links[1]).toHaveAttribute('href', `#/v1/tag/${encodeURIComponent('AI/LLM')}`)
  })
})

describe('PagesByTagView', () => {
  it('タグを持つページをタイトルの順に表示し、各ページへ移動できる', () => {
    render(<PagesByTagView index={index} vaultId="v1" tag="agent" />)
    expect(screen.getByRole('heading', { level: 1, name: '#agent' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'ページの一覧' })
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['ツール使用', '記憶'])
    expect(within(list).getByRole('link', { name: '記憶' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/memory.md')
  })

  it('どのページも持たないタグでは、その旨を表示する', () => {
    render(<PagesByTagView index={index} vaultId="v1" tag="存在しないタグ" />)
    expect(screen.getByText('このタグを持つページはありません。')).toBeInTheDocument()
  })
})

describe('PagesByTypeView', () => {
  it('type が一致するページを表示する', () => {
    render(<PagesByTypeView index={index} vaultId="v1" type="source" />)
    expect(screen.getByRole('heading', { level: 1, name: 'type: source' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'ページの一覧' })).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Codex リポジトリ',
    ])
  })
})
