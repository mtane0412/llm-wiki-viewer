import { describe, expect, it } from 'vitest'
import { isLogPage, parseLog } from './log'

/** スキーマどおりの見出しと、形式に合わない見出しが混在する log.md の本文です。 */
const logMarkdown = [
  '# 作業ログ',
  '',
  'LLM が追記する記録です。',
  '',
  '## [2026-10-14] ingest | Codex リポジトリ',
  '',
  '- 作成: [[sources/codex-repo]]',
  '- 更新: [[concepts/tool-use]]',
  '',
  '```md',
  '## [2026-01-01] ingest | コードブロックの中は見出しではない',
  '```',
  '',
  '## 2026-10-15 query ツールの承認方式',
  '',
  '形式に合わない見出しの本文',
  '',
  '## [2026-10-16] lint | 孤立ページの解消',
  '',
  '### 対応したページ',
  '',
  '- [[concepts/孤立した概念]]',
].join('\n')

describe('parseLog', () => {
  const log = parseLog(logMarkdown)

  it('最初のエントリより前の部分を前書きとして取り出す', () => {
    expect(log.preamble).toBe('# 作業ログ\n\nLLM が追記する記録です。')
  })

  it('形式どおりの見出しを日付・種類・タイトルに分解する', () => {
    expect(log.entries[0]).toMatchObject({ kind: 'entry', date: '2026-10-14', operation: 'ingest', title: 'Codex リポジトリ' })
    expect(log.entries[2]).toMatchObject({ kind: 'entry', date: '2026-10-16', operation: 'lint', title: '孤立ページの解消' })
  })

  it('エントリの本文は次の ## 見出しまでで、下位の見出しとコードブロックを含む', () => {
    expect(log.entries[0].body).toBe(
      '- 作成: [[sources/codex-repo]]\n- 更新: [[concepts/tool-use]]\n\n```md\n## [2026-01-01] ingest | コードブロックの中は見出しではない\n```',
    )
    expect(log.entries[2].body).toBe('### 対応したページ\n\n- [[concepts/孤立した概念]]')
  })

  it('形式に合わない ## 見出しは捨てずに解析エラーとして残す', () => {
    expect(log.entries[1]).toEqual({ kind: 'invalid', heading: '2026-10-15 query ツールの承認方式', body: '形式に合わない見出しの本文' })
    expect(log.entries[0]).toMatchObject({ heading: '[2026-10-14] ingest | Codex リポジトリ' })
  })

  it('スキーマに無い種類や、存在しない日付の見出しも解析エラーにする', () => {
    const { entries } = parseLog('## [2026-10-14] review | 種類が不明\n\n## [2026-02-30] ingest | 2 月 30 日\n\n## [2026-10-14] ingest |')
    expect(entries.map((entry) => entry.kind)).toEqual(['invalid', 'invalid', 'invalid'])
  })

  it('見出しの元の文字列（wikilink を含む）を、エントリの見出しとして保持する', () => {
    const { entries } = parseLog('## [2026-10-14] ingest | [[sources/codex-repo]] の取り込み')
    expect(entries[0]).toMatchObject({ heading: '[2026-10-14] ingest | [[sources/codex-repo]] の取り込み', title: '[[sources/codex-repo]] の取り込み' })
  })

  it('下線で書いた Setext 形式の見出しも、形式どおりなら日付・種類・タイトルに分解する', () => {
    const { entries } = parseLog('[2026-10-14] schema | 用語の統一\n---\n\n本文')
    expect(entries[0]).toMatchObject({ kind: 'entry', date: '2026-10-14', operation: 'schema', title: '用語の統一', body: '本文' })
  })

  it('100 年未満の年も、実在する日付なら形式どおりとみなす', () => {
    const { entries } = parseLog('## [0004-02-29] ingest | 紀元 4 年のうるう日\n\n## [0001-02-29] ingest | 紀元 1 年はうるう年ではない')
    expect(entries.map((entry) => entry.kind)).toEqual(['entry', 'invalid'])
  })

  it('エントリが無い log.md は、全体を前書きとして扱う', () => {
    expect(parseLog('# 作業ログ\n\nまだ記録がありません。')).toEqual({ preamble: '# 作業ログ\n\nまだ記録がありません。', entries: [] })
  })
})

describe('isLogPage', () => {
  it('Wiki ルート直下の log.md だけを作業ログとみなす（大文字小文字は区別しない）', () => {
    expect(isLogPage('wiki/log.md', 'wiki')).toBe(true)
    expect(isLogPage('wiki/Log.md', 'wiki')).toBe(true)
    expect(isLogPage('log.md', '')).toBe(true)
    expect(isLogPage('wiki/concepts/log.md', 'wiki')).toBe(false)
    expect(isLogPage('wiki/catalog.md', 'wiki')).toBe(false)
  })
})
