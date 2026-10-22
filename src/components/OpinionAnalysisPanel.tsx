/**
 * 意見 CSV を、ブラウザ内の埋め込みモデルで意見クラスタに分析するパネルです。
 *
 * 「意見を分析」を押すと、埋め込みモデル（初回はダウンロード）で意見をベクトルにし、クラスタに分けて散布図に描きます。
 * 埋め込みの結果は、入力の内容とモデルのハッシュをキーにキャッシュし、同じ入力を開いたときは再計算せずに表示します。
 * クラスタ数を変えても埋め込みは使い回します。結果は JSON で書き出せます。
 */
import { useContext, useEffect, useId, useMemo, useState } from 'react'
import { OpinionAnalysisContext, type OpinionAnalysisDeps } from '../app/opinionAnalysis'
import type { EmbeddingProgress } from '../embedding/embedder'
import { analysisCacheKey, clusterOpinions, serializeClusterJson } from '../lib/opinionClusters'
import type { Comment } from '../lib/opinions'
import { basename } from '../lib/path'
import { OpinionClustersView } from './OpinionClustersView'

/** OpinionAnalysisPanel の引数です。 */
export interface OpinionAnalysisPanelProps {
  /** 意見 CSV のパスです。 */
  path: string
  /** 意見 CSV の内容です（キャッシュのキーに使います）。 */
  csvText: string
  comments: Comment[]
}

/** キャッシュに保存する埋め込みの結果です。 */
interface CachedEmbeddings {
  modelId: string
  embeddings: number[][]
}

/** 分析の状態です。 */
type AnalysisState =
  | { status: 'checking-cache' }
  | { status: 'idle' }
  | { status: 'running'; progress: EmbeddingProgress | null }
  | { status: 'done'; embeddings: number[][] }
  | { status: 'error'; message: string }

/** 既定のクラスタ数です（意見の件数が少なければ件数にします）。 */
const DEFAULT_CLUSTER_COUNT = 5
/** 選べるクラスタ数の上限です。 */
const MAX_CLUSTER_COUNT = 12
/** バイトをメガバイトにする割る数です。 */
const BYTES_PER_MEGABYTE = 1_000_000

/** 進捗を表示します。 */
function ProgressView({ progress }: { progress: EmbeddingProgress | null }) {
  if (!progress) return <p className="muted">埋め込みモデルを準備しています…</p>
  const [label, done, total, detail] =
    progress.phase === 'download'
      ? ['モデルのダウンロード', progress.loadedBytes, progress.totalBytes, `${(progress.loadedBytes / BYTES_PER_MEGABYTE).toFixed(1)} / ${(progress.totalBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`]
      : ['意見の埋め込み', progress.done, progress.total, `${progress.done} / ${progress.total} 件`]
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <p className="analysis-progress">
      <span>{`${label} ${percent}%（${detail}）`}</span>
      <progress aria-label={label} value={percent} max={100} aria-valuenow={percent} />
    </p>
  )
}

/** 結果を JSON ファイルとして保存させます。 */
function downloadJson(json: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

/** 埋め込みの結果から、クラスタ数を選べる分析結果の画面を描画します。 */
function AnalysisResult({ path, comments, embeddings, modelId }: { path: string; comments: Comment[]; embeddings: number[][]; modelId: string }) {
  const [clusterCount, setClusterCount] = useState(Math.min(DEFAULT_CLUSTER_COUNT, comments.length))
  const selectId = useId()
  const result = useMemo(() => clusterOpinions(comments, embeddings, clusterCount), [comments, embeddings, clusterCount])
  const options = Array.from({ length: Math.min(MAX_CLUSTER_COUNT, comments.length) }, (_, index) => index + 1)
  return (
    <>
      <p className="analysis-toolbar">
        <label htmlFor={selectId}>クラスタ数</label>{' '}
        <select id={selectId} value={clusterCount} onChange={(event) => setClusterCount(Number(event.target.value))}>
          {options.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>{' '}
        <button
          type="button"
          className="button"
          onClick={() => downloadJson(serializeClusterJson(result, { modelId, source: path }), `${basename(path).replace(/\.csv$/i, '')}-clusters.json`)}
        >
          JSON を書き出す
        </button>
      </p>
      <p className="muted">{`埋め込みモデル: ${modelId}。書き出した JSON を raw/ に置くと、モデル無しでこの結果を表示できます。`}</p>
      {/* クラスタ数を変えたら、選んでいたクラスタの選択を解除します */}
      <OpinionClustersView key={clusterCount} result={result} />
    </>
  )
}

/** 依存を受け取った後の分析パネルの本体です。 */
function Panel({ deps, path, csvText, comments }: OpinionAnalysisPanelProps & { deps: OpinionAnalysisDeps }) {
  const { embedder, cache } = deps
  const [state, setState] = useState<AnalysisState>({ status: 'checking-cache' })

  // 同じ入力の結果がキャッシュにあれば、ボタンを押さなくても表示します
  useEffect(() => {
    let cancelled = false
    analysisCacheKey(csvText, embedder.modelId)
      .then((key) => cache.get<CachedEmbeddings>(key))
      .then(
        (cached) => {
          if (!cancelled) setState(cached ? { status: 'done', embeddings: cached.embeddings } : { status: 'idle' })
        },
        (cause: unknown) => {
          if (!cancelled) setState({ status: 'error', message: `キャッシュを読めませんでした: ${cause instanceof Error ? cause.message : String(cause)}` })
        },
      )
    return () => {
      cancelled = true
    }
  }, [csvText, embedder, cache])

  const run = async () => {
    setState({ status: 'running', progress: null })
    try {
      const { embeddings } = await embedder.embed(
        comments.map((comment) => comment.body),
        (progress) => setState({ status: 'running', progress }),
      )
      await cache.set(await analysisCacheKey(csvText, embedder.modelId), { modelId: embedder.modelId, embeddings } satisfies CachedEmbeddings)
      setState({ status: 'done', embeddings })
    } catch (cause) {
      setState({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  if (comments.length === 0) return <p className="muted">意見が無いため、分析できません。</p>
  switch (state.status) {
    case 'checking-cache':
      return <p className="muted">以前の分析結果を確認しています…</p>
    case 'idle':
      return (
        <div className="analysis-start">
          <p className="muted">
            {`ブラウザ内の埋め込みモデルで意見をベクトルにし、意味の近い意見のクラスタに分けて散布図に描きます。意見は端末の外に送りません。初回はモデル（${embedder.downloadSizeLabel}）をダウンロードし、以後はブラウザに保存したモデルを使います。`}
          </p>
          <button type="button" className="button button-primary" onClick={run}>
            意見を分析
          </button>
        </div>
      )
    case 'running':
      return <ProgressView progress={state.progress} />
    case 'error':
      return (
        <div>
          <p role="alert" className="error-banner">
            {`意見を分析できませんでした: ${state.message}`}
          </p>
          <button type="button" className="button" onClick={run}>
            もう一度分析
          </button>
        </div>
      )
    case 'done':
      return <AnalysisResult path={path} comments={comments} embeddings={state.embeddings} modelId={embedder.modelId} />
  }
}

/** 意見 CSV の分析パネルです。意見の分析の依存が提供されていない場合は何も表示しません。 */
export function OpinionAnalysisPanel(props: OpinionAnalysisPanelProps) {
  const deps = useContext(OpinionAnalysisContext)
  return deps ? <Panel deps={deps} {...props} /> : null
}
