import { describe, expect, it } from 'vitest'
import { extractWikilinks, parseWikilink } from './wikilink'

describe('parseWikilink', () => {
  it('リンク先だけの wikilink を解析する', () => {
    expect(parseWikilink('KarpathyのLLM Wiki')).toEqual({ target: 'KarpathyのLLM Wiki', heading: undefined, alias: undefined })
  })

  it('表示名つきの wikilink を解析する', () => {
    expect(parseWikilink('sources/codex-repo|Codex')).toEqual({ target: 'sources/codex-repo', heading: undefined, alias: 'Codex' })
  })

  it('表の中でエスケープされた区切り \\| も表示名として扱う', () => {
    expect(parseWikilink('気づく\\|気づく').alias).toBe('気づく')
    expect(parseWikilink('気づく\\|気づく').target).toBe('気づく')
  })

  it('見出しつきの wikilink を解析する', () => {
    expect(parseWikilink('dev-tools#デジタルツインと LLM|デジタルツイン')).toEqual({
      target: 'dev-tools',
      heading: 'デジタルツインと LLM',
      alias: 'デジタルツイン',
    })
  })

  it('末尾の .md を取り除く', () => {
    expect(parseWikilink('concepts/tool-use.md').target).toBe('concepts/tool-use')
  })
})

describe('extractWikilinks', () => {
  it('本文中の wikilink をすべて取り出す', () => {
    const body = '概念は [[concepts/tool-use]] と [[権限|権限モデル]] にある。'
    expect(extractWikilinks(body).map((link) => link.target)).toEqual(['concepts/tool-use', '権限'])
  })

  it('画像などの埋め込み ![[...]] には embed フラグを付ける', () => {
    const [link] = extractWikilinks('図: ![[assets/diagram.png]]')
    expect(link.embed).toBe(true)
    expect(link.target).toBe('assets/diagram.png')
  })

  it('コードブロックとインラインコードの中は無視する', () => {
    const body = ['本物 [[実在ページ]]', '```', '[[コード内]]', '```', '`[[インライン]]`'].join('\n')
    expect(extractWikilinks(body).map((link) => link.target)).toEqual(['実在ページ'])
  })
})
