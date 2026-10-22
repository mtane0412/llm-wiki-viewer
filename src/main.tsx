/**
 * アプリの起動処理です。
 *
 * 本番用の依存（IndexedDB の保存先、ブラウザのフォルダ選択ダイアログ、意見の分析の埋め込みモデルと LLM）を組み立てて App に渡します。
 */
import { createStore, get, set } from 'idb-keyval'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createWorkerEmbedder } from './embedding/embedder'
import { createWorkerLabeler } from './llm/labeler'
import { createSeenStore } from './source/seenStore'
import { createVaultRegistry } from './source/vaultRegistry'
import './index.css'

/** ファイルの変更を調べる間隔（ミリ秒）です。 */
const POLL_INTERVAL_MS = 3000

/** 意見の分析の結果（埋め込みとラベル）を保存する IndexedDB のデータベースです。Wiki の登録・既読の記録とは分けます。 */
const analysisStore = createStore('llm-wiki-viewer-analysis', 'embeddings')

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
        opinionAnalysis: {
          embedder: createWorkerEmbedder(),
          labeler: createWorkerLabeler(),
          cache: { get: (key) => get(key, analysisStore), set: (key, value) => set(key, value, analysisStore) },
        },
      }}
    />
  </StrictMode>,
)
