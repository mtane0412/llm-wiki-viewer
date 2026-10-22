import { describe, expect, it } from 'vitest'
import { documentTitle } from './documentTitle'
import { buildWikiIndex } from './wikiIndex'

const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/index.md', content: '---\ntitle: 目次\n---\n# 目次' },
    { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツールの使い方\n---\n本文' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})
const vault = { name: '料理の wiki', index }

describe('documentTitle', () => {
  it('Wiki を開いていないときはアプリ名だけにする', () => {
    expect(documentTitle({ view: 'start' }, undefined)).toBe('LLM Wiki Viewer')
  })

  it('ページの画面では、ページのタイトルと Wiki の名前を前に付ける', () => {
    const route = { view: 'page', vaultId: 'v1', path: 'wiki/concepts/tool-use.md', heading: undefined } as const
    expect(documentTitle(route, vault)).toBe('ツールの使い方 - 料理の wiki - LLM Wiki Viewer')
  })

  it('見つからないページの画面では、パスをタイトルの代わりにする', () => {
    const route = { view: 'page', vaultId: 'v1', path: 'wiki/存在しない.md', heading: undefined } as const
    expect(documentTitle(route, vault)).toBe('wiki/存在しない.md - 料理の wiki - LLM Wiki Viewer')
  })

  it('一覧の画面では、画面の名前を前に付ける', () => {
    expect(documentTitle({ view: 'lint', vaultId: 'v1' }, vault)).toBe('Lint - 料理の wiki - LLM Wiki Viewer')
    expect(documentTitle({ view: 'recent', vaultId: 'v1' }, vault)).toBe('最近 - 料理の wiki - LLM Wiki Viewer')
    expect(documentTitle({ view: 'callouts', vaultId: 'v1' }, vault)).toBe('未解決 - 料理の wiki - LLM Wiki Viewer')
    expect(documentTitle({ view: 'graph', vaultId: 'v1' }, vault)).toBe('グラフ - 料理の wiki - LLM Wiki Viewer')
    expect(documentTitle({ view: 'tags', vaultId: 'v1' }, vault)).toBe('タグ - 料理の wiki - LLM Wiki Viewer')
    expect(documentTitle({ view: 'schema', vaultId: 'v1', heading: undefined }, vault)).toBe('スキーマ（CLAUDE.md） - 料理の wiki - LLM Wiki Viewer')
  })

  it('タグ・type・検索の画面では、絞り込みの値もタイトルに含める', () => {
    expect(documentTitle({ view: 'tag', vaultId: 'v1', tag: '和食' }, vault)).toBe('タグ: 和食 - 料理の wiki - LLM Wiki Viewer')
    expect(documentTitle({ view: 'type', vaultId: 'v1', type: 'concept' }, vault)).toBe('type: concept - 料理の wiki - LLM Wiki Viewer')
    expect(documentTitle({ view: 'search', vaultId: 'v1', query: '出汁', all: false }, vault)).toBe('検索: 出汁 - 料理の wiki - LLM Wiki Viewer')
  })

  it('Wiki のホームでは Wiki の名前だけを前に付ける', () => {
    expect(documentTitle({ view: 'home', vaultId: 'v1' }, vault)).toBe('料理の wiki - LLM Wiki Viewer')
  })
})
