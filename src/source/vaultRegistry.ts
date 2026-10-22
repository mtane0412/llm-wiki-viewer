/**
 * 登録した Wiki フォルダ（ディレクトリハンドル）を IndexedDB に保存するモジュールです。
 *
 * File System Access API のハンドルは IndexedDB に保存でき、次回の起動時に同じフォルダを開き直せます。
 * ただし読み取りの許可はブラウザを閉じると失われることがあり、再度の許可にはユーザー操作（クリック）が必要です。
 */

/** 保存先のキー・バリューストアです。本番では idb-keyval、テストではメモリ上の実装を使います。 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
}

/** 登録済みの Wiki フォルダです。 */
export interface RegisteredVault {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
}

/** 登録済み Wiki フォルダの管理です。 */
export interface VaultRegistry {
  list(): Promise<RegisteredVault[]>
  /** フォルダを登録します。同じフォルダが登録済みなら既存の登録を返します。 */
  add(handle: FileSystemDirectoryHandle): Promise<RegisteredVault>
  remove(id: string): Promise<void>
}

/** ストアに保存するキーです。 */
const STORAGE_KEY = 'llm-wiki-viewer:vaults'

/**
 * 登録済み Wiki フォルダの管理を作ります。
 *
 * @param store - 保存先のキー・バリューストア
 * @returns 登録の管理
 */
export function createVaultRegistry(store: KeyValueStore): VaultRegistry {
  const list = async () => (await store.get<RegisteredVault[]>(STORAGE_KEY)) ?? []

  return {
    list,
    async add(handle) {
      const vaults = await list()
      for (const vault of vaults) {
        if (vault.handle === handle || (await handle.isSameEntry?.(vault.handle))) return vault
      }
      const vault: RegisteredVault = { id: crypto.randomUUID(), name: handle.name, handle }
      await store.set(STORAGE_KEY, [...vaults, vault])
      return vault
    },
    async remove(id) {
      await store.set(
        STORAGE_KEY,
        (await list()).filter((vault) => vault.id !== id),
      )
    },
  }
}

/**
 * フォルダの読み取り許可を確認し、必要なら許可を求めます。
 *
 * @param handle - フォルダのハンドル
 * @param request - 許可が無い場合に、ブラウザの許可ダイアログを出すかどうか（ユーザー操作の中でのみ true にできます）
 * @returns 許可が得られたかどうか
 */
export async function ensureReadPermission(handle: FileSystemDirectoryHandle, request: boolean): Promise<boolean> {
  const options = { mode: 'read' } as const
  if ((await handle.queryPermission(options)) === 'granted') return true
  if (!request) return false
  return (await handle.requestPermission(options)) === 'granted'
}
