import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { DeferredPageView } from './DeferredPageView'

describe('DeferredPageView', () => {
  it('開いたときに読み込んだ元資料の本文でも、wikilink のホバープレビューを表示する', async () => {
    const index = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/concepts/tool-use.md', content: '---\ntitle: ツール使用\n---\nツールを使う仕組みの本文。' }],
      unloadedMarkdownPaths: ['raw/notes/memo.md'],
      assetPaths: [],
    })
    const page = index.pageByPath.get('raw/notes/memo.md')
    if (!page) throw new Error('テストデータに元資料がありません')
    // 前提: 元資料の本文は、表示するときに readText で読み込みます
    const readText = vi.fn(async () => '# 生メモ\n\n[[concepts/tool-use]] についてのメモ。')
    window.scrollTo = vi.fn()
    render(<DeferredPageView page={page} index={index} vaultId="v1" heading={undefined} readText={readText} readBlob={vi.fn()} />)

    const user = userEvent.setup()
    await user.hover(await screen.findByRole('link', { name: 'ツール使用' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('ツールを使う仕組みの本文。')
  })
})
