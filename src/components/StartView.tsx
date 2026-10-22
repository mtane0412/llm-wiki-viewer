/**
 * Wiki を開く前に表示するスタート画面です。
 *
 * フォルダを開くボタンと、登録済みの Wiki（再接続が必要なものを含む）の一覧を表示します。
 */
import type { Vault } from '../app/useVaults'
import { FolderInput } from './FolderInput'

/** StartView の引数です。 */
export interface StartViewProps {
  vaults: Vault[]
  /** File System Access API が使えるかどうかです。 */
  supportsPicker: boolean
  onOpenDirectory: () => void
  onOpenFiles: (files: File[]) => void
  onReconnect: (id: string) => void
  onSelect: (id: string) => void
}

/** スタート画面です。 */
export function StartView({ vaults, supportsPicker, onOpenDirectory, onOpenFiles, onReconnect, onSelect }: StartViewProps) {
  return (
    <div className="start">
      <h1 className="start-title">LLM Wiki Viewer</h1>
      <p className="start-lead">
        Karpathy の LLM Wiki パターンで作った Wiki フォルダを、ブラウザで閲覧します。
        <br />
        ファイルはお使いの端末から外に送信されません。
      </p>
      <div className="start-actions">
        {supportsPicker ? (
          <button type="button" className="button button-primary" onClick={onOpenDirectory}>
            Wiki フォルダを開く
          </button>
        ) : (
          <FolderInput label="Wiki フォルダを選択（読み込み専用）" onSelect={onOpenFiles} />
        )}
      </div>
      <p className="start-hint">
        {supportsPicker
          ? 'wiki/ と raw/ を含むリポジトリのフォルダ、または wiki/ フォルダ自体を選んでください。開いたフォルダは次回も表示され、LLM による更新は自動で反映されます。'
          : 'このブラウザは File System Access API に対応していないため、選んだ時点の内容を読み込みます。変更の自動反映と次回の再表示には Chrome・Edge などの Chromium 系ブラウザが必要です。'}
      </p>

      {vaults.length > 0 && (
        <section className="start-vaults" aria-label="登録済みの Wiki">
          <h2>登録済みの Wiki</h2>
          <ul>
            {vaults.map((vault) => (
              <li key={vault.id}>
                <span className="start-vault-name">{vault.name}</span>
                {vault.status === 'needs-permission' && (
                  <button type="button" className="button" onClick={() => onReconnect(vault.id)}>
                    {`${vault.name} に再接続`}
                  </button>
                )}
                {vault.status === 'ready' && (
                  <button type="button" className="button" onClick={() => onSelect(vault.id)}>
                    {`${vault.name} を開く`}
                  </button>
                )}
                {vault.status === 'loading' && <span className="muted">読み込み中…</span>}
                {vault.status === 'error' && <span className="error-text">{vault.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
