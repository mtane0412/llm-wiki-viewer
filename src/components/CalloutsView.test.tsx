import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { CalloutsView } from './CalloutsView'

/** 矛盾（warning）と未確認（question）の callout を含む Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    {
      path: 'wiki/concepts/tool-use.md',
      content: '---\ntitle: ツール使用\n---\n> [!warning] 矛盾\n> 承認方式の記述がソース間で食い違う。\n\n> [!note] メモ\n> 補足。',
    },
    { path: 'wiki/concepts/memory.md', content: '---\ntitle: 記憶\n---\n> [!question] 未確認\n> 容量の上限は推測。' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

describe('CalloutsView', () => {
  it('矛盾の callout を、ページへのリンクと本文の抜粋とともに表示する', () => {
    render(<CalloutsView index={index} vaultId="v1" />)
    const conflicts = screen.getByRole('region', { name: /矛盾/ })
    expect(within(conflicts).getByRole('link', { name: 'ツール使用' })).toHaveAttribute('href', '#/v1/page/wiki/concepts/tool-use.md')
    expect(within(conflicts).getByText('承認方式の記述がソース間で食い違う。')).toBeInTheDocument()
    expect(within(conflicts).queryByText('補足。')).toBeNull()
  })

  it('未確認の callout を、矛盾とは別の区画に表示する', () => {
    render(<CalloutsView index={index} vaultId="v1" />)
    const questions = screen.getByRole('region', { name: /未確認/ })
    expect(within(questions).getByRole('link', { name: '記憶' })).toBeInTheDocument()
    expect(within(questions).getByText('容量の上限は推測。')).toBeInTheDocument()
    expect(within(questions).queryByRole('link', { name: 'ツール使用' })).toBeNull()
  })

  it('callout が無い区画では、その旨を表示する', () => {
    const empty = buildWikiIndex({ markdownFiles: [{ path: 'wiki/a.md', content: '本文' }], unloadedMarkdownPaths: [], assetPaths: [] })
    render(<CalloutsView index={empty} vaultId="v1" />)
    expect(within(screen.getByRole('region', { name: /矛盾/ })).getByText('該当する callout はありません。')).toBeInTheDocument()
  })
})
