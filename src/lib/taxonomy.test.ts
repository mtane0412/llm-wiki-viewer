import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from './wikiIndex'
import { countTags, countTypes, pagesWithTag, pagesWithType } from './taxonomy'

/** タグと type を持つページで構成した Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/index.md', content: '---\ntitle: 目次\n---\n目次' },
    { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\ntype: concept\ntags: [agent, tool]\n---\n本文' },
    { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\ntype: concept\ntags: [agent]\n---\n本文' },
    { path: 'wiki/sources/codex.md', content: '---\ntitle: Codex リポジトリ\ntype: source\ntags: [tool]\n---\n本文' },
    { path: 'wiki/analyses/比較.md', content: '---\ntitle: エージェントの比較\ntype: analysis\ntags: [agent]\n---\n本文' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

describe('countTags', () => {
  it('タグごとのページ数を、多い順（同数ならタグの文字列の順）に返す', () => {
    expect(countTags(index.pages)).toEqual([
      { value: 'agent', count: 3 },
      { value: 'tool', count: 2 },
    ])
  })
})

describe('countTypes', () => {
  it('type ごとのページ数を、多い順（同数なら type の文字列の順）に返し、type の無いページは数えない', () => {
    expect(countTypes(index.pages)).toEqual([
      { value: 'concept', count: 2 },
      { value: 'analysis', count: 1 },
      { value: 'source', count: 1 },
    ])
  })
})

describe('pagesWithTag', () => {
  it('タグを持つページを、タイトルの順に返す', () => {
    expect(pagesWithTag(index.pages, 'agent').map((page) => page.title)).toEqual(['エージェントの比較', 'ツール使用', '記憶'])
  })

  it('どのページも持たないタグでは空の配列を返す', () => {
    expect(pagesWithTag(index.pages, '存在しないタグ')).toEqual([])
  })
})

describe('pagesWithType', () => {
  it('type が一致するページを、タイトルの順に返す', () => {
    expect(pagesWithType(index.pages, 'concept').map((page) => page.title)).toEqual(['ツール使用', '記憶'])
  })
})
