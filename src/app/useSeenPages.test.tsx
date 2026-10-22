import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import type { SeenStore } from '../source/seenStore'
import { useSeenPages } from './useSeenPages'

/** 2 ページの Wiki です。 */
const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/a.md', content: '---\ntitle: A\n---\n本文 A' },
    { path: 'wiki/b.md', content: '---\ntitle: B\n---\n本文 B' },
  ],
  unloadedMarkdownPaths: [],
  assetPaths: [],
})

/** 保存した内容を記録するメモリ上の既読の記録の保存先です。 */
function createMemorySeenStore(): SeenStore & { saved: Record<string, string>[] } {
  const states = new Map<string, Record<string, string>>()
  const saved: Record<string, string>[] = []
  return {
    saved,
    load: async (vaultId) => states.get(vaultId),
    save: async (vaultId, state) => {
      states.set(vaultId, state)
      saved.push(state)
    },
  }
}

describe('useSeenPages', () => {
  it('続けて開いたページは、保存が終わる前に次のページを開いても、すべて既読として保存する', async () => {
    const store = createMemorySeenStore()
    // 前提: どちらのページも既読の基準に無い（新規の）状態から始めます
    await store.save('v1', {})
    const { result, rerender } = renderHook(({ path }: { path: string | null }) => useSeenPages(store, 'v1', index, path), {
      initialProps: { path: null as string | null },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ path: 'wiki/a.md' })
    rerender({ path: 'wiki/b.md' })
    await waitFor(() => expect(result.current.status === 'ready' && result.current.changes.size).toBe(0))
    expect(Object.keys(store.saved.at(-1) ?? {}).sort()).toEqual(['wiki/a.md', 'wiki/b.md'])
  })

  it('既読の記録の読み込みに失敗してもエラーとして返し、次に成功したらエラーを消す', async () => {
    const store = createMemorySeenStore()
    const load = vi.spyOn(store, 'load').mockRejectedValueOnce(new Error('IndexedDB を開けません'))
    const { result, rerender } = renderHook(({ wikiIndex }) => useSeenPages(store, 'v1', wikiIndex, null), { initialProps: { wikiIndex: index } })
    await waitFor(() => expect(result.current).toEqual({ status: 'error', message: expect.stringContaining('IndexedDB を開けません') }))

    // 自動の再読み込みで索引が作り直されると、読み込みをやり直します
    const reloaded = buildWikiIndex({ markdownFiles: [{ path: 'wiki/a.md', content: '本文 A' }], unloadedMarkdownPaths: [], assetPaths: [] })
    await act(async () => rerender({ wikiIndex: reloaded }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(load).toHaveBeenCalledTimes(2)
  })
})
