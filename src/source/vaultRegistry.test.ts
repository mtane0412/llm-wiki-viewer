import { describe, expect, it } from 'vitest'
import { createFakeFileSystem } from '../test/fakeFileSystem'
import { createVaultRegistry, type KeyValueStore } from './vaultRegistry'

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

describe('createVaultRegistry', () => {
  it('フォルダのハンドルを登録し、一覧で取り出せる', async () => {
    const registry = createVaultRegistry(createMemoryStore())
    const fs = createFakeFileSystem('design-llm-wiki', {})
    const saved = await registry.add(fs.root)
    expect(saved.name).toBe('design-llm-wiki')
    expect((await registry.list()).map((vault) => vault.id)).toEqual([saved.id])
  })

  it('同じフォルダを二重に登録しない', async () => {
    const registry = createVaultRegistry(createMemoryStore())
    const fs = createFakeFileSystem('crypto-wiki', {})
    const handle = Object.assign(fs.root, { isSameEntry: async (other: FileSystemHandle) => other === fs.root })
    const first = await registry.add(handle)
    const second = await registry.add(handle)
    expect(second.id).toBe(first.id)
    expect(await registry.list()).toHaveLength(1)
  })

  it('登録を解除できる', async () => {
    const registry = createVaultRegistry(createMemoryStore())
    const saved = await registry.add(createFakeFileSystem('消す Wiki', {}).root)
    await registry.remove(saved.id)
    expect(await registry.list()).toEqual([])
  })
})
