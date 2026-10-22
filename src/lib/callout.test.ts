import { describe, expect, it } from 'vitest'
import { collectCallouts, extractCallouts, parseCalloutMarker } from './callout'
import { buildWikiIndex } from './wikiIndex'

describe('parseCalloutMarker', () => {
  it('callout の種類とタイトルを取り出し、種類は小文字にする', () => {
    expect(parseCalloutMarker('[!WARNING] 矛盾')).toEqual({ type: 'warning', rawType: 'WARNING', title: '矛盾' })
  })

  it('Obsidian の別名は正規の種類にまとめる', () => {
    expect(parseCalloutMarker('[!caution] 注意')?.type).toBe('warning')
    expect(parseCalloutMarker('[!faq] よくある質問')?.type).toBe('question')
    expect(parseCalloutMarker('[!tldr] 要約')?.type).toBe('abstract')
  })

  it('未知の種類はそのまま小文字で返す', () => {
    expect(parseCalloutMarker('[!仮説] 検証待ち')).toEqual({ type: '仮説', rawType: '仮説', title: '検証待ち' })
  })

  it('タイトルが無ければ、種類の名前をタイトルにする', () => {
    expect(parseCalloutMarker('[!question]')).toEqual({ type: 'question', rawType: 'question', title: 'Question' })
  })

  it('折りたたみの記号（+ / -）はタイトルに含めない', () => {
    expect(parseCalloutMarker('[!note]- 補足')).toEqual({ type: 'note', rawType: 'note', title: '補足' })
  })

  it('callout の記法でなければ null を返す', () => {
    expect(parseCalloutMarker('ふつうの引用')).toBeNull()
    expect(parseCalloutMarker('[!] 種類なし')).toBeNull()
  })
})

describe('extractCallouts', () => {
  it('本文の callout を出現順に、種類・タイトル・本文の文字列として取り出す', () => {
    const markdown = [
      '# ツール使用',
      '',
      '> [!warning] 矛盾',
      '> [[source-a]] では X、**[[source-b]]** では Y とされている。',
      '> 未解決。',
      '',
      '> ふつうの引用',
      '',
      '> [!question] 未確認',
      '> 推測による記述。',
    ].join('\n')
    expect(extractCallouts(markdown)).toEqual([
      { type: 'warning', title: '矛盾', text: '[[source-a]] では X、[[source-b]] では Y とされている。 未解決。' },
      { type: 'question', title: '未確認', text: '推測による記述。' },
    ])
  })

  it('コードブロックの中の callout の記法は取り出さない', () => {
    expect(extractCallouts('```md\n> [!warning] 例\n```')).toEqual([])
  })
})

describe('collectCallouts', () => {
  const index = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\n---\n> [!warning] 矛盾\n> 承認方式の記述が食い違う。\n\n> [!note] メモ\n> 補足。' },
      { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\n---\n> [!question] 未確認\n> 容量の上限は推測。' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })

  it('指定した種類の callout を、ページのパスとともに集める', () => {
    expect(collectCallouts(index.pages, ['warning', 'question'])).toEqual([
      { pagePath: 'wiki/concepts/memory.md', type: 'question', title: '未確認', text: '容量の上限は推測。' },
      { pagePath: 'wiki/concepts/tool-use.md', type: 'warning', title: '矛盾', text: '承認方式の記述が食い違う。' },
    ])
  })
})
