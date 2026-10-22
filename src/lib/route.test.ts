import { describe, expect, it } from 'vitest'
import { formatRoute, parseRoute } from './route'

describe('route', () => {
  it('ページの URL を相互に変換する（日本語・空白を含むパス）', () => {
    const route = { view: 'page', vaultId: 'v1', path: 'wiki/KarpathyのLLM Wiki.md', heading: undefined } as const
    const hash = formatRoute(route)
    expect(hash).toBe('#/v1/page/wiki/Karpathy%E3%81%AELLM%20Wiki.md')
    expect(parseRoute(hash)).toEqual(route)
  })

  it('見出しつきのページの URL を相互に変換する', () => {
    const route = { view: 'page', vaultId: 'v1', path: 'wiki/dev-tools.md', heading: 'デジタルツインと LLM' } as const
    expect(parseRoute(formatRoute(route))).toEqual(route)
  })

  it('lint とグラフの URL を相互に変換する', () => {
    expect(parseRoute(formatRoute({ view: 'lint', vaultId: 'v1' }))).toEqual({ view: 'lint', vaultId: 'v1' })
    expect(parseRoute(formatRoute({ view: 'graph', vaultId: 'v1' }))).toEqual({ view: 'graph', vaultId: 'v1' })
  })

  it('タグ・type の一覧の URL を相互に変換する', () => {
    expect(formatRoute({ view: 'tags', vaultId: 'v1' })).toBe('#/v1/tags')
    expect(parseRoute('#/v1/tags')).toEqual({ view: 'tags', vaultId: 'v1' })
  })

  it('タグで絞り込んだ一覧の URL を相互に変換する（/ を含む日本語のタグ）', () => {
    const route = { view: 'tag', vaultId: 'v1', tag: 'AI/大規模言語モデル' } as const
    const hash = formatRoute(route)
    // タグの中の / は区切りと区別するためにエンコードします
    expect(hash).toBe(`#/v1/tag/${encodeURIComponent('AI/大規模言語モデル')}`)
    expect(parseRoute(hash)).toEqual(route)
  })

  it('type で絞り込んだ一覧の URL を相互に変換する', () => {
    const route = { view: 'type', vaultId: 'v1', type: 'concept' } as const
    expect(formatRoute(route)).toBe('#/v1/type/concept')
    expect(parseRoute(formatRoute(route))).toEqual(route)
  })

  it('値の無いタグ・type の URL はスタート画面として扱う', () => {
    expect(parseRoute('#/v1/tag')).toEqual({ view: 'start' })
    expect(parseRoute('#/v1/type/')).toEqual({ view: 'start' })
  })

  it('Wiki だけを指定した URL はその Wiki のホームとして扱う', () => {
    expect(parseRoute('#/v1')).toEqual({ view: 'home', vaultId: 'v1' })
  })

  it('空や不明な URL はスタート画面として扱う', () => {
    expect(parseRoute('')).toEqual({ view: 'start' })
    expect(parseRoute('#/v1/unknown')).toEqual({ view: 'start' })
  })
})
