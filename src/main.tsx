/**
 * アプリの起動処理です。
 *
 * 本番用の依存（IndexedDB の保存先と、ブラウザのフォルダ選択ダイアログ）を組み立てて App に渡します。
 */
import { get, set } from 'idb-keyval'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createSeenStore } from './source/seenStore'
import { createVaultRegistry } from './source/vaultRegistry'
import './index.css'

/** ファイルの変更を調べる間隔（ミリ秒）です。 */
const POLL_INTERVAL_MS = 3000

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root 要素が見つかりません')

createRoot(rootElement).render(
  <StrictMode>
    <App
      deps={{
        registry: createVaultRegistry({ get, set }),
        seenStore: createSeenStore({ get, set }),
        pickDirectory: 'showDirectoryPicker' in window ? () => window.showDirectoryPicker({ mode: 'read' }) : null,
        pollIntervalMs: POLL_INTERVAL_MS,
      }}
    />
  </StrictMode>,
)
