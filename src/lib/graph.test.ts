import { describe, expect, it } from 'vitest'
import { buildGraphData } from './graph'
import { buildWikiIndex } from './wikiIndex'

describe('buildGraphData', () => {
  const index = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/index.md', content: '[[a]] [[b]]' },
      { path: 'wiki/concepts/a.md', content: '---\ntype: concept\n---\n[[b]] [[b]] [[a]] [[raw/memo]]' },
      { path: 'wiki/b.md', content: '[[a]]' },
      { path: 'raw/memo.md', content: 'メモ' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })
  const graph = buildGraphData(index)

  it('Wiki のページだけをノードにし、目次の index は除く', () => {
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['wiki/b.md', 'wiki/concepts/a.md'])
  })

  it('ノードのグループは type、無ければフォルダ名にする', () => {
    expect(graph.nodes.find((node) => node.id === 'wiki/concepts/a.md')?.group).toBe('concept')
    expect(graph.nodes.find((node) => node.id === 'wiki/b.md')?.group).toBe('(root)')
  })

  it('同じ組のリンクは向きを問わず 1 本にまとめ、自己リンクは除く', () => {
    expect(graph.links).toEqual([{ source: 'wiki/b.md', target: 'wiki/concepts/a.md' }])
  })
})
