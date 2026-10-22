/**
 * 開いている Wiki（vault）の一覧と、その読み込み状態を管理する React フックです。
 *
 * - 起動時に、IndexedDB に登録済みのフォルダを読み込みます。読み取り許可が残っていれば自動で開きます
 * - 許可が切れたフォルダは「再接続」で許可を求め直します（ブラウザの仕様でクリック操作が必要です）
 * - 監視できる Wiki は一定間隔でファイル一覧を調べ、変更があれば読み直します
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WikiIndex } from '../lib/wikiIndex'
import { createFileListSource } from '../source/fileListSource'
import { createFsAccessSource } from '../source/fsAccessSource'
import { createVaultLoader, type VaultLoader } from '../source/loadVault'
import { ensureReadPermission, type VaultRegistry } from '../source/vaultRegistry'
import type { WikiSource } from '../source/WikiSource'

/** アプリが外部から受け取る依存です。テストでは偽物に差し替えます。 */
export interface AppDeps {
  /** 登録済みフォルダの保存先です。 */
  registry: VaultRegistry
  /** フォルダ選択ダイアログを開く関数です。File System Access API が無いブラウザでは null です。 */
  pickDirectory: (() => Promise<FileSystemDirectoryHandle>) | null
  /** ファイルの変更を調べる間隔（ミリ秒）です。 */
  pollIntervalMs: number
}

/** Wiki の読み込み状態です。 */
export type VaultStatus = 'needs-permission' | 'loading' | 'ready' | 'error'

/** 画面に渡す Wiki の情報です。 */
export interface Vault {
  id: string
  name: string
  /** IndexedDB に登録されており、次回も開けるかどうかです。 */
  persisted: boolean
  /** ファイルの変更を自動で検知できるかどうかです。 */
  watchable: boolean
  status: VaultStatus
  index: WikiIndex | null
  error: string | null
  /** フォルダ内のファイルをテキストとして読み込む関数です。読み込み前は null です。 */
  readText: ((path: string) => Promise<string>) | null
  /** フォルダ内のファイルをバイナリとして読み込む関数です。読み込み前は null です。 */
  readBlob: ((path: string) => Promise<Blob>) | null
}

/** useVaults が返す操作です。 */
export interface VaultsApi {
  vaults: Vault[]
  /** 起動時の登録済みフォルダの読み込みが終わったかどうかです。 */
  initialized: boolean
  /** 直近の操作で起きたエラーです。 */
  error: string | null
  /** フォルダ選択ダイアログで Wiki を開きます。キャンセルされた場合は null を返します。 */
  openDirectory(): Promise<string | null>
  /** `<input webkitdirectory>` で選んだファイルから Wiki を開きます。 */
  openFiles(files: File[]): Promise<string | null>
  /** 読み取り許可を求め直して Wiki を開きます。 */
  reconnect(id: string): Promise<void>
  /** Wiki の登録を解除します。フォルダ内のファイルには触れません。 */
  remove(id: string): Promise<void>
}

/** フォルダごとの読み込み器などの内部状態です。 */
interface VaultRuntime {
  handle: FileSystemDirectoryHandle | null
  loader: VaultLoader | null
  /** 再読み込みが重ならないようにするためのフラグです。 */
  busy: boolean
}

/** エラーを表示用の文字列にします。 */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** ユーザーがダイアログをキャンセルしたことを表すエラーかを判定します。 */
function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

/**
 * 開いている Wiki の一覧と操作を返します。
 *
 * @param deps - 登録済みフォルダの保存先などの依存
 * @returns Wiki の一覧と操作
 */
export function useVaults(deps: AppDeps): VaultsApi {
  const { registry, pickDirectory, pollIntervalMs } = deps
  const [vaults, setVaults] = useState<Vault[]>([])
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runtimes = useRef(new Map<string, VaultRuntime>())
  // イベント処理やタイマーから最新の一覧を参照するため、描画後に ref へ写します
  const vaultsRef = useRef<Vault[]>([])
  useEffect(() => {
    vaultsRef.current = vaults
  }, [vaults])

  /** 指定した Wiki の状態を部分的に更新します。 */
  const patch = useCallback((id: string, changes: Partial<Vault>) => {
    setVaults((current) => current.map((vault) => (vault.id === id ? { ...vault, ...changes } : vault)))
  }, [])

  /** 一覧に Wiki を追加します。同じ id が既にあれば置き換えます。 */
  const upsert = useCallback((vault: Vault) => {
    setVaults((current) => (current.some((item) => item.id === vault.id) ? current.map((item) => (item.id === vault.id ? vault : item)) : [...current, vault]))
  }, [])

  /** WikiSource から索引を読み込み、状態を ready にします。 */
  const connect = useCallback(
    async (id: string, source: WikiSource) => {
      const loader = createVaultLoader(source)
      const runtime = runtimes.current.get(id)
      if (!runtime) throw new Error(`Wiki の内部状態がありません: ${id}`)
      runtime.loader = loader
      runtime.busy = true
      patch(id, { status: 'loading', error: null, watchable: source.watchable, readText: (path) => source.readText(path), readBlob: (path) => source.readBlob(path) })
      try {
        const { index } = await loader.load()
        patch(id, { status: 'ready', index })
      } catch (cause) {
        patch(id, { status: 'error', error: messageOf(cause) })
      } finally {
        runtime.busy = false
      }
    },
    [patch],
  )

  // 起動時に、登録済みのフォルダを読み込みます（StrictMode で 2 回実行されないようにします）
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const registered = await registry.list()
        for (const item of registered) {
          runtimes.current.set(item.id, { handle: item.handle, loader: null, busy: false })
          upsert({ id: item.id, name: item.name, persisted: true, watchable: true, status: 'needs-permission', index: null, error: null, readText: null, readBlob: null })
        }
        await Promise.all(
          registered.map(async (item) => {
            if (await ensureReadPermission(item.handle, false)) await connect(item.id, createFsAccessSource(item.handle))
          }),
        )
      } catch (cause) {
        setError(`登録済みの Wiki を読み込めませんでした: ${messageOf(cause)}`)
      } finally {
        setInitialized(true)
      }
    })()
  }, [registry, connect, upsert])

  // 監視できる Wiki のファイル変更を一定間隔で調べます
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      for (const vault of vaultsRef.current) {
        const runtime = runtimes.current.get(vault.id)
        if (vault.status !== 'ready' || !vault.watchable || !runtime?.loader || runtime.busy) continue
        const loader = runtime.loader
        runtime.busy = true
        void (async () => {
          try {
            if (await loader.hasChanges()) {
              const { index } = await loader.load()
              patch(vault.id, { index, error: null })
            } else if (vaultsRef.current.find((item) => item.id === vault.id)?.error) {
              // 変更が無くても確認に成功したので、前回の一時的な失敗の警告を消します
              patch(vault.id, { error: null })
            }
          } catch (cause) {
            // LLM の書き込み途中などの一時的な失敗では監視を止めず、ready のまま次の周期で再試行します
            patch(vault.id, { error: `再読み込みに失敗しました（次の周期で再試行します）: ${messageOf(cause)}` })
          } finally {
            runtime.busy = false
          }
        })()
      }
    }, pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [pollIntervalMs, patch])

  const openDirectory = useCallback(async () => {
    if (!pickDirectory) throw new Error('このブラウザは File System Access API に対応していません')
    setError(null)
    try {
      const handle = await pickDirectory()
      const registered = await registry.add(handle)
      const existing = vaultsRef.current.find((vault) => vault.id === registered.id)
      if (existing?.status === 'ready') return registered.id
      runtimes.current.set(registered.id, { handle, loader: null, busy: false })
      upsert({ id: registered.id, name: registered.name, persisted: true, watchable: true, status: 'loading', index: null, error: null, readText: null, readBlob: null })
      await connect(registered.id, createFsAccessSource(handle))
      return registered.id
    } catch (cause) {
      if (isAbortError(cause)) return null
      setError(`フォルダを開けませんでした: ${messageOf(cause)}`)
      return null
    }
  }, [pickDirectory, registry, connect, upsert])

  const openFiles = useCallback(
    async (files: File[]) => {
      setError(null)
      try {
        const source = createFileListSource(files)
        const id = `session-${crypto.randomUUID()}`
        runtimes.current.set(id, { handle: null, loader: null, busy: false })
        upsert({ id, name: source.name, persisted: false, watchable: false, status: 'loading', index: null, error: null, readText: null, readBlob: null })
        await connect(id, source)
        return id
      } catch (cause) {
        setError(`フォルダを開けませんでした: ${messageOf(cause)}`)
        return null
      }
    },
    [connect, upsert],
  )

  const reconnect = useCallback(
    async (id: string) => {
      const handle = runtimes.current.get(id)?.handle
      if (!handle) throw new Error(`再接続できる Wiki ではありません: ${id}`)
      setError(null)
      try {
        if (await ensureReadPermission(handle, true)) await connect(id, createFsAccessSource(handle))
        else setError(`「${handle.name}」の読み取りが許可されませんでした`)
      } catch (cause) {
        setError(`再接続できませんでした: ${messageOf(cause)}`)
      }
    },
    [connect],
  )

  const remove = useCallback(
    async (id: string) => {
      const vault = vaultsRef.current.find((item) => item.id === id)
      if (vault?.persisted) await registry.remove(id)
      runtimes.current.delete(id)
      setVaults((current) => current.filter((item) => item.id !== id))
    },
    [registry],
  )

  return { vaults, initialized, error, openDirectory, openFiles, reconnect, remove }
}
