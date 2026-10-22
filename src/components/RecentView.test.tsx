import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { RecentView } from './RecentView'

/** updated を持つページ 2 件と、持たないページ 1 件の Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\nupdated: 2026-10-20\n---\n本文' },
    { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\nupdated: 2026-10-01\n---\n本文' },
    { path: 'wiki/concepts/draft.md', content: '---\ntitle: 下書き\n---\n本文' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

describe('RecentView', () => {
  it('updated の新しい順にページを並べ、前回の閲覧以降に変わったページには印を付ける', () => {
    render(<RecentView index={index} vaultId="v1" seenPages={{ status: 'ready', changes: new Map([['wiki/concepts/memory.md', 'changed']]) }} />)
    const recent = screen.getByRole('region', { name: '最近更新されたページ' })
    const items = within(recent).getAllByRole('listitem')
    expect(items.map((item) => within(item).getByRole('link').textContent)).toEqual(['ツール使用', '記憶'])
    expect(items[0]).toHaveTextContent('2026-10-20')
    expect(items[1]).toHaveTextContent('更新あり')
    expect(recent).toHaveTextContent('updated の無い 1 ページは含めていません。')
  })

  it('既読の記録を読み書きできなかった場合は、エラーとして表示する', () => {
    render(<RecentView index={index} vaultId="v1" seenPages={{ status: 'error', message: '既読の記録を読み書きできませんでした: 容量不足' }} />)
    const changed = screen.getByRole('region', { name: '前回の閲覧以降に変わったページ' })
    expect(within(changed).getByRole('alert')).toHaveTextContent('容量不足')
  })
})
