import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { ArgumentMapView } from './ArgumentMapView'

/** frontmatter つきの Markdown を組み立てるテスト用ヘルパーです。 */
function page(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n本文`
}

/** 論点「給食を無償化すべきか」に、立場が 1 つ、賛成と反対の論拠が 1 つずつある Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/論点.md', content: page('title: 給食を無償化すべきか\ntype: issue') },
    { path: 'wiki/賛成.md', content: page('title: 無償化に賛成\ntype: position\nissue: "[[論点]]"') },
    { path: 'wiki/負担軽減.md', content: page('title: 子育て世帯の負担が減る\ntype: argument\nsupports: "[[賛成]]"\nsources: ["[[市の調査]]"]') },
    { path: 'wiki/財源.md', content: page('title: 財源が足りない\ntype: argument\nopposes: "[[賛成]]"\nsources: ["[[市の調査]]"]') },
    { path: 'wiki/市の調査.md', content: page('title: 市の調査\ntype: source') },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

describe('ArgumentMapView', () => {
  it('論点ごとに、立場と賛成・反対の論拠をページへのリンクとして表示する', () => {
    render(<ArgumentMapView index={index} vaultId="v1" />)
    const issue = screen.getByRole('region', { name: '給食を無償化すべきか' })
    expect(within(issue).getByRole('link', { name: '給食を無償化すべきか' })).toHaveAttribute('href', `#/v1/page/wiki/${encodeURIComponent('論点')}.md`)
    expect(within(issue).getByRole('link', { name: '無償化に賛成' })).toHaveAttribute('href', `#/v1/page/wiki/${encodeURIComponent('賛成')}.md`)
    // 賛成の論拠と反対の論拠は、それぞれの見出しの付いた一覧に分けて表示します
    expect(within(within(issue).getByRole('list', { name: '賛成の論拠' })).getByRole('link', { name: '子育て世帯の負担が減る' })).toBeInTheDocument()
    expect(within(within(issue).getByRole('list', { name: '反対の論拠' })).getByRole('link', { name: '財源が足りない' })).toBeInTheDocument()
  })

  it('論拠の出典（sources）へのリンクを表示する', () => {
    render(<ArgumentMapView index={index} vaultId="v1" />)
    const supports = screen.getByRole('list', { name: '賛成の論拠' })
    expect(within(supports).getByRole('link', { name: '市の調査' })).toHaveAttribute('href', `#/v1/page/wiki/${encodeURIComponent('市の調査')}.md`)
  })

  it('出典は、論拠とは別の「〇〇の出典」という名前の一覧に分けて表示する', () => {
    render(<ArgumentMapView index={index} vaultId="v1" />)
    // 論拠のリンクと見分けられるよう、出典は論拠ごとの入れ子の一覧にまとめます
    const sources = screen.getByRole('list', { name: '子育て世帯の負担が減るの出典' })
    expect(within(sources).getByRole('link', { name: '市の調査' })).toBeInTheDocument()
    expect(within(sources).queryByRole('link', { name: '子育て世帯の負担が減る' })).not.toBeInTheDocument()
  })

  it('Wiki に無い出典は、リンクにせず書かれたとおりの名前で出典の一覧に表示する', () => {
    const unresolved = buildWikiIndex({
      markdownFiles: [
        { path: 'wiki/論点.md', content: page('title: 給食を無償化すべきか\ntype: issue') },
        { path: 'wiki/賛成.md', content: page('title: 無償化に賛成\ntype: position\nissue: "[[論点]]"') },
        { path: 'wiki/負担軽減.md', content: page('title: 子育て世帯の負担が減る\ntype: argument\nsupports: "[[賛成]]"\nsources: ["[[未取材の記事]]"]') },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    render(<ArgumentMapView index={unresolved} vaultId="v1" />)
    const sources = screen.getByRole('list', { name: '子育て世帯の負担が減るの出典' })
    expect(within(sources).getByText('未取材の記事')).toBeInTheDocument()
    expect(within(sources).queryByRole('link')).not.toBeInTheDocument()
  })

  it('出典の無い論拠には、出典の一覧を表示しない', () => {
    const noSources = buildWikiIndex({
      markdownFiles: [
        { path: 'wiki/論点.md', content: page('title: 給食を無償化すべきか\ntype: issue') },
        { path: 'wiki/賛成.md', content: page('title: 無償化に賛成\ntype: position\nissue: "[[論点]]"') },
        { path: 'wiki/負担軽減.md', content: page('title: 子育て世帯の負担が減る\ntype: argument\nsupports: "[[賛成]]"') },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    render(<ArgumentMapView index={noSources} vaultId="v1" />)
    expect(screen.queryByRole('list', { name: '子育て世帯の負担が減るの出典' })).not.toBeInTheDocument()
    expect(screen.queryByText('出典')).not.toBeInTheDocument()
  })

  it('立場の無い論点では、その旨を表示する', () => {
    const lonely = buildWikiIndex({ markdownFiles: [{ path: 'wiki/論点.md', content: page('title: 議論の無い論点\ntype: issue') }], unloadedMarkdownPaths: [], assetPaths: [] })
    render(<ArgumentMapView index={lonely} vaultId="v1" />)
    expect(within(screen.getByRole('region', { name: '議論の無い論点' })).getByText('この論点に対する立場はまだありません。')).toBeInTheDocument()
  })

  it('論点のページが無い Wiki では、スキーマの書き方を案内する', () => {
    const empty = buildWikiIndex({ markdownFiles: [{ path: 'wiki/a.md', content: '本文' }], unloadedMarkdownPaths: [], assetPaths: [] })
    render(<ArgumentMapView index={empty} vaultId="v1" />)
    expect(screen.getByText(/type: issue のページがありません/)).toBeInTheDocument()
  })
})
