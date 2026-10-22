import { describe, expect, it } from 'vitest'
import { extractHeadings } from './toc'
import type { RemarkWikilinkOptions } from './remarkWikilink'

/** 「ツール使用」というタイトルのページだけを解決できる、テスト用の wikilink の設定です。 */
const wikilinkOptions: RemarkWikilinkOptions = {
  resolve: (target) => (target === 'tool-use' ? 'wiki/tool-use.md' : null),
  titleOf: () => 'ツール使用',
  hrefOf: () => '#',
}

describe('extractHeadings', () => {
  it('見出しの階層と文字列を本文の順に取り出す', () => {
    const markdown = '# LLM Wiki\n\n本文\n\n## 取り込み\n\n### 要約の作り方\n\n## 点検'
    expect(extractHeadings(markdown, wikilinkOptions)).toEqual([
      { depth: 1, text: 'LLM Wiki' },
      { depth: 2, text: '取り込み' },
      { depth: 3, text: '要約の作り方' },
      { depth: 2, text: '点検' },
    ])
  })

  it('強調・インラインコードの記号を除いた文字列にする', () => {
    expect(extractHeadings('## **重要な** `log.md` の書式', wikilinkOptions)).toEqual([{ depth: 2, text: '重要な log.md の書式' }])
  })

  it('見出しの中の wikilink は本文の描画と同じ表示名にする', () => {
    expect(extractHeadings('## [[tool-use]] の承認\n\n## [[未作成|別名]] の扱い', wikilinkOptions)).toEqual([
      { depth: 2, text: 'ツール使用 の承認' },
      { depth: 2, text: '別名 の扱い' },
    ])
  })

  it('コードブロックの中の # は見出しにしない', () => {
    expect(extractHeadings('```sh\n# コメント\n```\n\n## 本当の見出し', wikilinkOptions)).toEqual([{ depth: 2, text: '本当の見出し' }])
  })

  it('Setext 形式の見出しも取り出す', () => {
    expect(extractHeadings('概要\n====\n\n詳細\n----', wikilinkOptions)).toEqual([
      { depth: 1, text: '概要' },
      { depth: 2, text: '詳細' },
    ])
  })

  it('見出しが無ければ空の配列を返す', () => {
    expect(extractHeadings('本文だけのページ', wikilinkOptions)).toEqual([])
  })
})
