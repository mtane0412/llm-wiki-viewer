/**
 * raw/ の JSON ファイルを開いたときに表示するコンポーネントです。
 *
 * 意見の分析で書き出した意見クラスタの JSON を、埋め込みモデル無しで表示します。
 * 意見クラスタの JSON の形式でない場合は、その理由を表示します。
 */
import { useEffect, useState } from 'react'
import { parseClusterJson, type ClusterJson } from '../lib/opinionClusters'
import { basename } from '../lib/path'
import { OpinionClustersView } from './OpinionClustersView'

/** ClusterJsonFileView の引数です。 */
export interface ClusterJsonFileViewProps {
  path: string
  readText: (path: string) => Promise<string>
}

/** 読み込みの状態です。 */
type LoadState = { status: 'loading'; path: string } | { status: 'error'; path: string; message: string } | { status: 'ready'; path: string; data: ClusterJson }

/** raw/ の JSON ファイルの画面です。 */
export function ClusterJsonFileView({ path, readText }: ClusterJsonFileViewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading', path })

  useEffect(() => {
    let cancelled = false
    readText(path)
      .then((text) => parseClusterJson(text))
      .then(
        (data) => {
          if (!cancelled) setState({ status: 'ready', path, data })
        },
        (cause: unknown) => {
          if (!cancelled) setState({ status: 'error', path, message: cause instanceof Error ? cause.message : String(cause) })
        },
      )
    return () => {
      cancelled = true
    }
  }, [path, readText])

  if (state.path !== path || state.status === 'loading') return <p className="muted">読み込み中…</p>
  return (
    <div className="csv-file">
      <h1>{basename(path)}</h1>
      <p className="muted lint-path">{path}</p>
      {state.status === 'error' ? (
        <p role="alert" className="error-banner">
          {`JSON を表示できませんでした: ${state.message}`}
        </p>
      ) : (
        <>
          <p className="muted">{`${state.data.source} の意見を、埋め込みモデル ${state.data.modelId} で分析した結果です。`}</p>
          {state.data.labelModelId && <p className="muted">{`クラスタのラベルは LLM ${state.data.labelModelId} が生成した要約です。`}</p>}
          <OpinionClustersView result={state.data.result} labels={state.data.labels} />
        </>
      )}
    </div>
  )
}
