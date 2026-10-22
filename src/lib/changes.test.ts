import { describe, expect, it } from 'vitest'
import { detectChanges, hashPage, recentlyUpdated, snapshotOf } from './changes'
import { buildWikiIndex, type MarkdownFile } from './wikiIndex'

/** Markdown ファイルから索引を作るヘルパーです。 */
function indexOf(markdownFiles: MarkdownFile[]) {
  return buildWikiIndex({ markdownFiles, unloadedMarkdownPaths: ['raw/notes/memo.md'], assetPaths: [] })
}

/** LLM が ingest する前の Wiki です。 */
const before = indexOf([
  { path: 'wiki/index.md', content: '---\ntitle: 目次\nupdated: 2026-10-01\n---\n- [[concepts/tool-use]]' },
  { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\nupdated: 2026-10-10\n---\n本文' },
  { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\n---\n本文' },
])

/** ingest で tool-use の本文が更新され、agent が追加された後の Wiki です（memory は変わっていません）。 */
const after = indexOf([
  { path: 'wiki/index.md', content: '---\ntitle: 目次\nupdated: 2026-10-01\n---\n- [[concepts/tool-use]]' },
  { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\nupdated: 2026-10-20\n---\n本文（更新）' },
  { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\n---\n本文' },
  { path: 'wiki/concepts/agent.md', content: '---\ntitle: エージェント\nupdated: 2026-10-20\n---\n本文' },
])

describe('hashPage', () => {
  it('frontmatter か本文が変われば、別の値になる', () => {
    const toolUseBefore = before.pageByPath.get('wiki/concepts/tool-use.md')
    const toolUseAfter = after.pageByPath.get('wiki/concepts/tool-use.md')
    if (!toolUseBefore || !toolUseAfter) throw new Error('テストデータにページがありません')
    expect(hashPage(toolUseBefore)).not.toBe(hashPage(toolUseAfter))
  })

  it('内容が同じなら同じ値になる', () => {
    const memoryBefore = before.pageByPath.get('wiki/concepts/memory.md')
    const memoryAfter = after.pageByPath.get('wiki/concepts/memory.md')
    if (!memoryBefore || !memoryAfter) throw new Error('テストデータにページがありません')
    expect(hashPage(memoryBefore)).toBe(hashPage(memoryAfter))
  })
})

describe('snapshotOf', () => {
  it('内容を読み込んだ wiki のページだけを、パスとハッシュの対応として記録する', () => {
    expect(Object.keys(snapshotOf(before.pages)).sort()).toEqual(['wiki/concepts/memory.md', 'wiki/concepts/tool-use.md', 'wiki/index.md'])
  })
})

describe('detectChanges', () => {
  it('既読の時点から内容が変わったページを「更新あり」、既読の記録に無いページを「新規」とする', () => {
    const changes = detectChanges(after.pages, snapshotOf(before.pages))
    expect([...changes].sort()).toEqual([
      ['wiki/concepts/agent.md', 'new'],
      ['wiki/concepts/tool-use.md', 'changed'],
    ])
  })

  it('既読の時点から何も変わっていなければ空にする', () => {
    expect(detectChanges(before.pages, snapshotOf(before.pages)).size).toBe(0)
  })
})

describe('recentlyUpdated', () => {
  it('updated のあるページを新しい順（同じ日付ならタイトルの順）に並べ、updated の無いページは含めない', () => {
    expect(recentlyUpdated(after.pages).map((page) => page.title)).toEqual(['エージェント', 'ツール使用', '目次'])
  })

  it('updated が YYYY-MM-DD の形式でないページは、日付の順に並べられないため含めない', () => {
    const informal = indexOf([
      { path: 'wiki/a.md', content: '---\ntitle: 10 月 9 日\nupdated: 2026-10-9\n---\n本文' },
      { path: 'wiki/b.md', content: '---\ntitle: 10 月 10 日\nupdated: 2026-10-10\n---\n本文' },
      { path: 'wiki/c.md', content: '---\ntitle: 英語の日付\nupdated: March 5\n---\n本文' },
    ])
    expect(recentlyUpdated(informal.pages).map((page) => page.title)).toEqual(['10 月 10 日'])
  })
})
