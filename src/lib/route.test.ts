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

  it('Wiki だけを指定した URL はその Wiki のホームとして扱う', () => {
    expect(parseRoute('#/v1')).toEqual({ view: 'home', vaultId: 'v1' })
  })

  it('空や不明な URL はスタート画面として扱う', () => {
    expect(parseRoute('')).toEqual({ view: 'start' })
    expect(parseRoute('#/v1/unknown')).toEqual({ view: 'start' })
  })
})
