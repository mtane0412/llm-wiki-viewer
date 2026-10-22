import { describe, expect, it } from 'vitest'
import { createResolver, type ResolvableEntry } from './resolver'

/** テスト用のページ一覧です。wiki/ と raw/ を持つ典型的な LLM Wiki を想定しています。 */
const entries: ResolvableEntry[] = [
  { path: 'wiki/index.md', area: 'wiki', title: 'Index', aliases: [] },
  { path: 'wiki/concepts/tool-use.md', area: 'wiki', title: 'Tool use', aliases: ['ツール使用'] },
  { path: 'wiki/sources/codex-repo.md', area: 'wiki', title: 'Codex リポジトリ', aliases: [] },
  { path: 'wiki/concepts/codex-repo.md', area: 'wiki', title: '同名の別ページ', aliases: [] },
  { path: 'wiki/KarpathyのLLM Wiki.md', area: 'wiki', title: 'KarpathyのLLM Wiki', aliases: [] },
  { path: 'raw/notes/session-01.md', area: 'raw', title: 'session-01', aliases: [] },
  { path: 'raw/assets/diagram.png', area: 'raw', title: 'diagram.png', aliases: [] },
]

const resolve = createResolver(entries, 'wiki')

describe('createResolver', () => {
  it('wiki/ からの相対パスで解決する', () => {
    expect(resolve('concepts/tool-use', 'wiki/index.md')).toBe('wiki/concepts/tool-use.md')
  })

  it('Wiki フォルダ全体からのパスで解決する（raw/ へのリンク）', () => {
    expect(resolve('raw/notes/session-01', 'wiki/index.md')).toBe('raw/notes/session-01.md')
  })

  it('ファイル名だけでも解決する（空白や日本語を含む）', () => {
    expect(resolve('KarpathyのLLM Wiki', 'wiki/index.md')).toBe('wiki/KarpathyのLLM Wiki.md')
  })

  it('大文字と小文字を区別しない', () => {
    expect(resolve('CONCEPTS/Tool-Use', 'wiki/index.md')).toBe('wiki/concepts/tool-use.md')
  })

  it('ファイル名が重複する場合はリンク元と同じフォルダを優先する', () => {
    expect(resolve('codex-repo', 'wiki/concepts/tool-use.md')).toBe('wiki/concepts/codex-repo.md')
    expect(resolve('codex-repo', 'wiki/sources/other.md')).toBe('wiki/sources/codex-repo.md')
  })

  it('aliases や title でも解決する', () => {
    expect(resolve('ツール使用', 'wiki/index.md')).toBe('wiki/concepts/tool-use.md')
    expect(resolve('Codex リポジトリ', 'wiki/index.md')).toBe('wiki/sources/codex-repo.md')
  })

  it('拡張子つきの画像ファイルを解決する', () => {
    expect(resolve('diagram.png', 'wiki/index.md')).toBe('raw/assets/diagram.png')
  })

  it('見つからない場合は null を返す', () => {
    expect(resolve('存在しないページ', 'wiki/index.md')).toBeNull()
  })
})
