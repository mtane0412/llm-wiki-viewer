import { describe, expect, it } from 'vitest'
import { previewOf } from './preview'
import { buildWikiIndex } from './wikiIndex'

/** プレビューの対象になるページを含む Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    {
      path: 'wiki/concepts/tool-use.md',
      content: [
        '---',
        'title: ツール使用',
        'type: concept',
        '---',
        '# ツール使用',
        '',
        'エージェントが **シェル** と [[concepts/editor|エディタ]] を使う仕組みです。',
        '',
        '## 承認',
        '',
        '危険な操作の前に [[concepts/approval]] を求めます。',
        '',
        '### 例外',
        '',
        '読み取りだけの操作は承認を省きます。',
        '',
        '## 関連',
        '',
        '- [[concepts/memory]]',
      ].join('\n'),
    },
    { path: 'wiki/concepts/long.md', content: `---\ntitle: 長いページ\n---\n${'あ'.repeat(300)}` },
  ],
  unloadedMarkdownPaths: ['raw/notes/memo.md'],
  assetPaths: [],
})

describe('previewOf', () => {
  it('ページのタイトル・type と、先頭の h1 を除いた本文の冒頭を返す（Markdown の記号と wikilink の括弧は除く）', () => {
    expect(previewOf(index, 'wiki/concepts/tool-use.md', undefined)).toEqual({
      kind: 'page',
      title: 'ツール使用',
      type: 'concept',
      excerpt: 'エージェントが シェル と エディタ を使う仕組みです。 承認 危険な操作の前に concepts/approval を求めます。 例外 読み取りだけの操作は承認を省きます。 関連 concepts/memory',
    })
  })

  it('見出しを指定した場合は、その見出しの直後から、同じか上の段の次の見出しまでを返す', () => {
    expect(previewOf(index, 'wiki/concepts/tool-use.md', '承認')).toMatchObject({
      heading: '承認',
      excerpt: '危険な操作の前に concepts/approval を求めます。 例外 読み取りだけの操作は承認を省きます。',
    })
  })

  it('長い本文は決まった文字数で切り、末尾に … を付ける', () => {
    const preview = previewOf(index, 'wiki/concepts/long.md', undefined)
    expect(preview.kind === 'page' && preview.excerpt).toBe(`${'あ'.repeat(160)}…`)
  })

  it('見つからない見出しを指定した場合は、その旨を示す', () => {
    expect(previewOf(index, 'wiki/concepts/tool-use.md', '存在しない見出し')).toMatchObject({ kind: 'page', excerpt: '', missingHeading: true })
  })

  it('内容を読み込んでいない元資料は、開いたときに読み込むことを示す', () => {
    expect(previewOf(index, 'raw/notes/memo.md', undefined)).toEqual({ kind: 'unloaded', title: 'memo' })
  })
})
