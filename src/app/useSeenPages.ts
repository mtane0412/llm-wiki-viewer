/**
 * 表示中の Wiki の既読の記録を読み書きし、前回の閲覧以降に変わったページを返す React フックです。
 *
 * - 記録の無い Wiki（初めて開いた Wiki）では、その時点の全ページを既読の基準にして保存します
 * - ページを開くと、そのページの現在の内容を既読として保存します。開いている間に内容が変わった場合も既読にします
 * - 記録の読み書き（IndexedDB）に失敗した場合は、エラーとして返します
 * 判定の方法は lib/changes.ts を参照してください。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { detectChanges, hashPage, snapshotOf, type PageChange, type SeenState } from '../lib/changes'
import type { WikiIndex } from '../lib/wikiIndex'
import type { SeenStore } from '../source/seenStore'

/** 前回の閲覧以降の変化の状態です。 */
export type SeenPagesState =
  | { status: 'loading' }
  | { status: 'ready'; changes: Map<string, PageChange> }
  | { status: 'error'; message: string }

/** 読み込んだ既読の記録と、その記録の Wiki の id です。 */
interface LoadedSeen {
  vaultId: string
  seen: SeenState
}

/** 既読の記録の読み書きで起きたエラーと、その Wiki の id です。 */
interface SeenError {
  vaultId: string
  message: string
}

/** エラーを表示用の文字列にします。 */
function messageOf(cause: unknown): string {
  return `既読の記録を読み書きできませんでした: ${cause instanceof Error ? cause.message : String(cause)}`
}

/**
 * 前回の閲覧以降に変わったページを返します。
 *
 * @param store - 既読の記録の保存先
 * @param vaultId - 表示中の Wiki の id
 * @param index - 表示中の Wiki の索引（読み込み前は null）
 * @param currentPath - 開いているページのパス（ページを開いていなければ null）
 * @returns 変化の状態
 */
export function useSeenPages(store: SeenStore, vaultId: string | null, index: WikiIndex | null, currentPath: string | null): SeenPagesState {
  const [loaded, setLoaded] = useState<LoadedSeen | null>(null)
  const [error, setError] = useState<SeenError | null>(null)
  // 保存の途中で次のページを開いても既読を取りこぼさないよう、最新の既読の記録を同期的に持ちます
  const latest = useRef<LoadedSeen | null>(null)
  const current = loaded !== null && loaded.vaultId === vaultId ? loaded : null

  // Wiki を切り替えたら、その Wiki の既読の記録を読み込みます。記録が無ければ現在の全ページを基準にします
  useEffect(() => {
    if (vaultId === null || index === null || current !== null) return
    let cancelled = false
    const load = async () => {
      const stored = await store.load(vaultId)
      // 読み込みの間に索引が作り直された場合は、古い索引で基準を作らずに終えます
      if (stored || cancelled) return stored
      const seen = snapshotOf(index.pages)
      await store.save(vaultId, seen)
      return seen
    }
    load().then(
      (seen) => {
        if (cancelled || seen === undefined) return
        latest.current = { vaultId, seen }
        setLoaded({ vaultId, seen })
        setError(null)
      },
      (cause: unknown) => {
        if (!cancelled) setError({ vaultId, message: messageOf(cause) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [store, vaultId, index, current])

  // 開いているページの現在の内容を既読にします
  useEffect(() => {
    if (current === null || index === null || currentPath === null) return
    const page = index.pageByPath.get(currentPath)
    if (!page || page.area !== 'wiki' || !page.loaded) return
    const hash = hashPage(page)
    const base = latest.current?.vaultId === current.vaultId ? latest.current : current
    if (base.seen[currentPath] === hash) return
    const next: LoadedSeen = { vaultId: current.vaultId, seen: { ...base.seen, [currentPath]: hash } }
    latest.current = next
    // 保存できてから既読の状態を更新します（保存に失敗した記録を画面だけで既読扱いにしないため）
    store.save(next.vaultId, next.seen).then(
      () => {
        setLoaded((shown) => (shown?.vaultId === next.vaultId && latest.current === next ? next : shown))
        setError(null)
      },
      (cause: unknown) => setError({ vaultId: next.vaultId, message: messageOf(cause) }),
    )
  }, [store, current, index, currentPath])

  const changes = useMemo(() => (current !== null && index !== null ? detectChanges(index.pages, current.seen) : null), [current, index])
  if (error !== null && error.vaultId === vaultId) return { status: 'error', message: error.message }
  return changes === null ? { status: 'loading' } : { status: 'ready', changes }
}
