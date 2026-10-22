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
    { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\n---\n本文' },
    {
      path: 'wiki/concepts/mixed.md',
      content: [
        '---',
        'title: 混在',
        '---',
        '- りんご',
        '- バナナ',
        '',
        '| 列 1 | 列 2 |',
        '|---|---|',
        '| 値 1 | 値 2 |',
        '',
        '<div>生の HTML</div>',
        '',
        '`[[concepts/memory|コードの中]]` と ![[diagram.png]] と [[concepts/memory]]',
        '',
        '```sh',
        'echo コードブロック',
        '```',
        '',
        '## [[concepts/memory]] の使い方',
        '',
        '見出しに wikilink を含む節。',
      ].join('\n'),
    },
  ],
  unloadedMarkdownPaths: ['raw/notes/memo.md'],
  assetPaths: ['raw/assets/diagram.png'],
})

describe('previewOf', () => {
  it('ページのタイトル・type と、先頭の h1 を除いた本文の冒頭を返す（Markdown の記号と wikilink の括弧は除く）', () => {
    expect(previewOf(index, 'wiki/concepts/tool-use.md', undefined)).toEqual({
      kind: 'page',
      title: 'ツール使用',
      type: 'concept',
      excerpt: 'エージェントが シェル と エディタ を使う仕組みです。 承認 危険な操作の前に concepts/approval を求めます。 例外 読み取りだけの操作は承認を省きます。 関連 記憶',
    })
  })

  it('見出しを指定した場合は、その見出しの直後から、同じか上の段の次の見出しまでを返す', () => {
    expect(previewOf(index, 'wiki/concepts/tool-use.md', '承認')).toMatchObject({
      heading: '承認',
      excerpt: '危険な操作の前に concepts/approval を求めます。 例外 読み取りだけの操作は承認を省きます。',
    })
  })

  it('リストの項目と表のセルは空白で区切り、コード・HTML・画像の埋め込みは含めず、wikilink は本文と同じくタイトルで表す', () => {
    expect(previewOf(index, 'wiki/concepts/mixed.md', undefined)).toMatchObject({
      excerpt: 'りんご バナナ 列 1 列 2 値 1 値 2 [[concepts/memory|コードの中]] と と 記憶 記憶 の使い方 見出しに wikilink を含む節。',
    })
  })

  it('見出しの中の wikilink は、本文の見出しの id と同じくタイトルに置き換えて照合する', () => {
    expect(previewOf(index, 'wiki/concepts/mixed.md', '記憶 の使い方')).toMatchObject({ excerpt: '見出しに wikilink を含む節。' })
  })

  it('callout の記法（[!type]）は抜粋に含めず、タイトルと本文だけを含める', () => {
    const calloutIndex = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/a.md', content: '---\ntitle: 矛盾のあるページ\n---\n> [!warning] 矛盾\n> 記述が食い違う。' }],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    expect(previewOf(calloutIndex, 'wiki/a.md', undefined)).toMatchObject({ excerpt: '矛盾 記述が食い違う。' })
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
