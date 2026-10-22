import { describe, expect, it } from 'vitest'
import { buildWikiIndex, rankRedLinks } from './wikiIndex'

/** frontmatter つきの Markdown を組み立てるテスト用ヘルパーです。 */
function page(frontmatter: string, body: string): string {
  return `---\n${frontmatter}\n---\n${body}`
}

/** 典型的な LLM Wiki（wiki/ と raw/ を持つ）を表すテストデータです。 */
const files = [
  { path: 'CLAUDE.md', content: '# スキーマ\n[[壊れていても無視される]]' },
  { path: 'wiki/index.md', content: page('title: Index', '- [[concepts/tool-use]] — ツール\n- [[sources/codex-repo]]') },
  { path: 'wiki/log.md', content: page('title: Log', '## 2026-10-14 ingest') },
  {
    path: 'wiki/concepts/tool-use.md',
    content: page('title: Tool use\ntype: concept\ntags: [tool]\nsources: ["[[sources/codex-repo]]"]', '[[存在しないページ]] を参照。'),
  },
  { path: 'wiki/concepts/孤立した概念.md', content: page('title: 孤立した概念\ntype: concept\nsources: []', '本文') },
  { path: 'wiki/sources/codex-repo.md', content: page('title: Codex リポジトリ\ntype: source\nsources: []', '原文は [[raw/notes/codex]]') },
  { path: 'wiki/broken-yaml.md', content: '---\ntitle: [閉じ忘れ\n---\n本文' },
]

describe('buildWikiIndex', () => {
  const index = buildWikiIndex({ markdownFiles: files, unloadedMarkdownPaths: ['raw/notes/codex.md'], assetPaths: ['raw/assets/a.png'] })

  it('wiki/ フォルダがあればそこを Wiki のルートとみなす', () => {
    expect(index.wikiRoot).toBe('wiki')
  })

  it('wiki/ と raw/ の外にある Markdown はページに含めない', () => {
    expect(index.pageByPath.has('CLAUDE.md')).toBe(false)
  })

  it('ページの領域（wiki / raw）とタイトルを設定する', () => {
    expect(index.pageByPath.get('wiki/concepts/tool-use.md')).toMatchObject({ area: 'wiki', title: 'Tool use', type: 'concept', tags: ['tool'] })
    expect(index.pageByPath.get('raw/notes/codex.md')).toMatchObject({ area: 'raw', title: 'codex', loaded: false, body: '' })
    expect(index.pageByPath.get('wiki/index.md')?.loaded).toBe(true)
  })

  it('タグは先頭の # を除き、空白だけの値を除き、日付は YYYY-MM-DD の文字列にする', () => {
    const tagged = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/a.md', content: page('tags: ["#ai", agent, "", "  ", 2026-10-14]', '本文') }],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    expect(tagged.pageByPath.get('wiki/a.md')?.tags).toEqual(['ai', 'agent', '2026-10-14'])
  })

  it('index.md をホームページにする', () => {
    expect(index.homePath).toBe('wiki/index.md')
  })

  it('本文の wikilink からのリンクをバックリンクとして集計する', () => {
    // 前提: codex-repo へは index.md が本文から、tool-use が frontmatter の sources からリンクしています
    expect(index.backlinks.get('wiki/sources/codex-repo.md')).toEqual(['wiki/index.md'])
    expect(index.backlinks.get('raw/notes/codex.md')).toEqual(['wiki/sources/codex-repo.md'])
  })

  it('frontmatter の sources からの参照を、バックリンクとは別に根拠としての被参照として集計する', () => {
    expect(index.citations.get('wiki/sources/codex-repo.md')).toEqual(['wiki/concepts/tool-use.md'])
    expect(index.citations.has('raw/notes/codex.md')).toBe(false)
  })

  it('sources からしか参照されていないページも孤立ページとはみなさない', () => {
    const citedOnly = buildWikiIndex({
      markdownFiles: [
        { path: 'wiki/index.md', content: '[[concepts/agent]]' },
        { path: 'wiki/concepts/agent.md', content: '---\nsources: ["[[sources/paper]]"]\n---\n本文' },
        { path: 'wiki/sources/paper.md', content: '---\ntype: source\n---\n論文の要約' },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    expect(citedOnly.issues).not.toContainEqual({ kind: 'orphan', page: 'wiki/sources/paper.md' })
  })

  it('壊れたリンクを lint の指摘にする', () => {
    expect(index.issues).toContainEqual({ kind: 'broken-link', page: 'wiki/concepts/tool-use.md', target: '存在しないページ' })
  })

  it('被リンクのないページを孤立ページとして指摘する（index と log は除く）', () => {
    const orphans = index.issues.filter((issue) => issue.kind === 'orphan').map((issue) => issue.page)
    expect(orphans).toContain('wiki/concepts/孤立した概念.md')
    expect(orphans).not.toContain('wiki/index.md')
    expect(orphans).not.toContain('wiki/log.md')
  })

  it('sources が空の概念ページを指摘し、ソース要約ページは対象外にする', () => {
    const missing = index.issues.filter((issue) => issue.kind === 'missing-sources').map((issue) => issue.page)
    expect(missing).toContain('wiki/concepts/孤立した概念.md')
    expect(missing).not.toContain('wiki/sources/codex-repo.md')
    expect(missing).not.toContain('wiki/concepts/tool-use.md')
  })

  it('frontmatter の YAML エラーを指摘する', () => {
    expect(index.issues).toContainEqual(expect.objectContaining({ kind: 'frontmatter-error', page: 'wiki/broken-yaml.md' }))
  })

  it('index.md のパスを索引に記録する', () => {
    expect(index.indexPagePath).toBe('wiki/index.md')
  })

  it('index.md からリンクされていないページを指摘する（index・log と raw/、孤立ページは対象外）', () => {
    const notInIndex = index.issues.filter((issue) => issue.kind === 'not-in-index').map((issue) => issue.page)
    // 前提: index.md は tool-use と codex-repo だけにリンクしています。
    // 孤立した概念と broken-yaml はどこからもリンクされていないため、孤立ページとしてだけ指摘します
    expect(notInIndex).toEqual([])
  })

  it('raw/ のページは lint の対象外にする', () => {
    expect(index.issues.some((issue) => issue.page.startsWith('raw/'))).toBe(false)
  })

  it('wiki/ フォルダが無い場合は選択したフォルダ全体を Wiki とみなす', () => {
    const flat = buildWikiIndex({
      markdownFiles: [
        { path: 'INDEX.md', content: '[[LLM Wiki]]' },
        { path: 'LLM Wiki.md', content: '# LLM Wiki' },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    expect(flat.wikiRoot).toBe('')
    expect(flat.homePath).toBe('INDEX.md')
    expect(flat.indexPagePath).toBe('INDEX.md')
    expect(flat.backlinks.get('LLM Wiki.md')).toEqual(['INDEX.md'])
  })
})

describe('index.md 未掲載の判定', () => {
  const catalog = buildWikiIndex({
    markdownFiles: [
      {
        path: 'wiki/index.md',
        content: '---\nsources: ["[[concepts/memory]]"]\n---\n- [[concepts/agent]]\n\n![[concepts/planning]]',
      },
      { path: 'wiki/overview.md', content: '[[concepts/memory]] [[concepts/planning]] [[concepts/index]] [[concepts/log]]' },
      { path: 'wiki/concepts/agent.md', content: 'エージェント' },
      { path: 'wiki/concepts/memory.md', content: '記憶' },
      { path: 'wiki/concepts/planning.md', content: '計画' },
      { path: 'wiki/concepts/index.md', content: '概念の一覧' },
      { path: 'wiki/concepts/log.md', content: '概念の変更記録' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })
  const notInIndex = catalog.issues.filter((issue) => issue.kind === 'not-in-index').map((issue) => issue.page)

  it('index.md の本文の通常の wikilink だけを掲載とみなし、埋め込みと frontmatter の sources は数えない', () => {
    expect(notInIndex).not.toContain('wiki/concepts/agent.md')
    expect(notInIndex).toContain('wiki/concepts/memory.md')
    expect(notInIndex).toContain('wiki/concepts/planning.md')
  })

  it('除外するのは Wiki ルート直下の index・log・overview だけで、サブフォルダの同名ページは判定する', () => {
    expect(notInIndex).not.toContain('wiki/overview.md')
    expect(notInIndex).toContain('wiki/concepts/index.md')
    expect(notInIndex).toContain('wiki/concepts/log.md')
  })

  it('大文字小文字だけが違う index.md が複数ある場合は、小文字の index.md を目次とみなす', () => {
    const duplicated = buildWikiIndex({
      markdownFiles: [
        { path: 'wiki/INDEX.md', content: '大文字の目次' },
        { path: 'wiki/index.md', content: '小文字の目次' },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    expect(duplicated.indexPagePath).toBe('wiki/index.md')
    expect(duplicated.homePath).toBe('wiki/index.md')
  })
})

describe('index.md が無い Wiki', () => {
  const noIndex = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/overview.md', content: '[[concepts/agent]]' },
      { path: 'wiki/concepts/agent.md', content: 'エージェントの説明' },
      { path: 'wiki/concepts/memory.md', content: '記憶の説明' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })

  it('index.md のパスを null にし、全ページを未掲載とは扱わない', () => {
    expect(noIndex.indexPagePath).toBeNull()
    expect(noIndex.issues.some((issue) => issue.kind === 'not-in-index')).toBe(false)
  })

  it('サブフォルダの index.md は Wiki の目次とみなさない', () => {
    const nested = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/concepts/index.md', content: '[[agent]]' }, { path: 'wiki/concepts/agent.md', content: '本文' }],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    expect(nested.indexPagePath).toBeNull()
  })
})

describe('rankRedLinks', () => {
  /** 未作成のページへのリンクを、表記ゆれを含めて複数のページに書いた Wiki です。 */
  const redLinkWiki = buildWikiIndex({
    markdownFiles: [
      { path: 'wiki/index.md', content: '[[RAG]] と [[検索拡張生成]] と [[RAG]]（同じページから 2 回）' },
      { path: 'wiki/concepts/agent.md', content: '[[rag]] を使う。[[検索拡張生成]] も参照。' },
      { path: 'wiki/concepts/memory.md', content: '[[RAG.md]] と [[ベクトル DB]]' },
      { path: 'wiki/concepts/tool-use.md', content: '[[concepts/agent]] は作成済み' },
    ],
    unloadedMarkdownPaths: [],
    assetPaths: [],
  })
  const ranking = rankRedLinks(redLinkWiki.issues)

  it('未作成のリンク先を、参照元ページ数の多い順に並べる', () => {
    expect(ranking.map((item) => [item.target, item.pages.length])).toEqual([
      ['RAG', 3],
      ['検索拡張生成', 2],
      ['ベクトル DB', 1],
    ])
  })

  it('大文字小文字と拡張子 .md の違いはリゾルバと同じく同じリンク先として数え、最も多く書かれた表記で示す', () => {
    // 前提: 「RAG」は 2 回、「rag」と「RAG.md」は 1 回ずつ書かれています
    expect(ranking[0]).toEqual({ target: 'RAG', pages: ['wiki/concepts/agent.md', 'wiki/concepts/memory.md', 'wiki/index.md'] })
  })

  it('同じページから同じリンク先へ複数回リンクしても、参照元は 1 ページとして数える', () => {
    expect(ranking.find((item) => item.target === '検索拡張生成')?.pages).toEqual(['wiki/concepts/agent.md', 'wiki/index.md'])
  })

  it('作成済みのページへのリンクは含めない', () => {
    expect(ranking.some((item) => item.target === 'concepts/agent')).toBe(false)
  })

  it('参照数が同じリンク先は、リンク先の文字列の順に並べる', () => {
    const tie = rankRedLinks([
      { kind: 'broken-link', page: 'wiki/a.md', target: '未作成B' },
      { kind: 'broken-link', page: 'wiki/a.md', target: '未作成A' },
    ])
    expect(tie.map((item) => item.target)).toEqual(['未作成A', '未作成B'])
  })
})
