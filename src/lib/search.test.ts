import { describe, expect, it } from 'vitest'
import { searchPages } from './search'
import { buildWikiIndex } from './wikiIndex'

describe('searchPages', () => {
  const index = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/権限モデル.md', content: '---\ntitle: 権限モデル\naliases: [パーミッション]\n---\nサンドボックスと承認の仕組みを比べる。' },
      { path: 'wiki/サンドボックス.md', content: '---\ntitle: サンドボックス\n---\nOS ネイティブの隔離。' },
      { path: 'wiki/無関係.md', content: '---\ntitle: 無関係\n---\n天気の話。' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })

  it('タイトルに一致するページを本文だけの一致より上位にする', () => {
    const results = searchPages(index.pages, 'サンドボックス')
    expect(results.map((result) => result.path)).toEqual(['wiki/サンドボックス.md', 'wiki/権限モデル.md'])
  })

  it('aliases でも検索できる', () => {
    expect(searchPages(index.pages, 'パーミッション')[0].path).toBe('wiki/権限モデル.md')
  })

  it('空白で区切った語はすべて含むページだけを返す', () => {
    expect(searchPages(index.pages, 'サンドボックス 承認').map((result) => result.path)).toEqual(['wiki/権限モデル.md'])
  })

  it('本文の一致箇所の前後を抜粋として返す', () => {
    expect(searchPages(index.pages, '承認')[0].snippet).toContain('承認の仕組み')
  })

  it('空の検索語では何も返さない', () => {
    expect(searchPages(index.pages, '   ')).toEqual([])
  })
})
