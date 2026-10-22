import { describe, expect, it } from 'vitest'
import { createSeenStore } from './seenStore'
import type { KeyValueStore } from './vaultRegistry'

/** IndexedDB の代わりに使うメモリ上のキー・バリューストアです。 */
function createMemoryStore(): KeyValueStore {
  const map = new Map<string, unknown>()
  return {
    get: async <T,>(key: string) => map.get(key) as T | undefined,
    set: async (key: string, value: unknown) => {
      map.set(key, value)
    },
  }
}

describe('createSeenStore', () => {
  it('Wiki ごとに既読の記録を保存し、読み出せる', async () => {
    const seenStore = createSeenStore(createMemoryStore())
    await seenStore.save('料理の Wiki', { 'wiki/出汁.md': 'aaaa0001' })
    await seenStore.save('エージェントの Wiki', { 'wiki/index.md': 'bbbb0002' })
    expect(await seenStore.load('料理の Wiki')).toEqual({ 'wiki/出汁.md': 'aaaa0001' })
    expect(await seenStore.load('エージェントの Wiki')).toEqual({ 'wiki/index.md': 'bbbb0002' })
  })

  it('記録の無い Wiki では undefined を返す', async () => {
    expect(await createSeenStore(createMemoryStore()).load('初めて開く Wiki')).toBeUndefined()
  })
})
