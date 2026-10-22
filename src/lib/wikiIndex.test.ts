import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from './wikiIndex'

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

  it('index.md をホームページにする', () => {
    expect(index.homePath).toBe('wiki/index.md')
  })

  it('本文と frontmatter の sources からバックリンクを集計する', () => {
    expect(index.backlinks.get('wiki/sources/codex-repo.md')).toEqual(['wiki/concepts/tool-use.md', 'wiki/index.md'])
    expect(index.backlinks.get('raw/notes/codex.md')).toEqual(['wiki/sources/codex-repo.md'])
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
    expect(flat.backlinks.get('LLM Wiki.md')).toEqual(['INDEX.md'])
  })
})
