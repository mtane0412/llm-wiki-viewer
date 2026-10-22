/**
 * Wiki ごとの既読の記録（ページを開いた時点の内容のハッシュ）を IndexedDB に保存するモジュールです。
 *
 * 前回の閲覧以降に内容が変わったページを判定するために使います（lib/changes.ts）。
 */
import type { SeenState } from '../lib/changes'
import type { KeyValueStore } from './vaultRegistry'

/** 既読の記録の保存先です。 */
export interface SeenStore {
  /** Wiki の既読の記録を読み出します。記録が無ければ undefined です。 */
  load(vaultId: string): Promise<SeenState | undefined>
  /** Wiki の既読の記録を保存します。 */
  save(vaultId: string, state: SeenState): Promise<void>
}

/** Wiki ごとの保存先のキーです。 */
function keyOf(vaultId: string): string {
  return `llm-wiki-viewer:seen:${vaultId}`
}

/**
 * 既読の記録の保存先を作ります。
 *
 * @param store - 保存先のキー・バリューストア
 * @returns 既読の記録の保存先
 */
export function createSeenStore(store: KeyValueStore): SeenStore {
  return {
    load: (vaultId) => store.get<SeenState>(keyOf(vaultId)),
    save: (vaultId, state) => store.set(keyOf(vaultId), state),
  }
}
