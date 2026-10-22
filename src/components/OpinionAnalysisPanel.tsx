/**
 * 意見 CSV を、ブラウザ内の埋め込みモデルで意見クラスタに分析するパネルです。
 *
 * 「意見を分析」を押すと、埋め込みモデル（初回はダウンロード）で意見をベクトルにし、クラスタに分けて散布図に描きます。
 * 埋め込みの結果は、入力の内容とモデルのハッシュをキーにキャッシュし、同じ入力を開いたときは再計算せずに表示します。
 * クラスタ数を変えても埋め込みは使い回します。結果は JSON で書き出せます。
 * 「ラベルを生成」を押すと、各クラスタの代表的な意見からブラウザ内の LLM で見出しと説明を生成します（クラスタ数ごとにキャッシュします）。
 */
import { useContext, useEffect, useId, useMemo, useState } from 'react'
import { OpinionAnalysisContext, type OpinionAnalysisDeps } from '../app/opinionAnalysis'
import type { EmbeddingDevice, EmbeddingProgress } from '../embedding/embedder'
import type { GenerationProgress, LabelerSupport } from '../llm/labeler'
import { buildLabelMessages, parseLabelOutput, pickBasisComments, type ClusterLabel } from '../lib/clusterLabels'
import { analysisCacheKey, clusterOpinions, serializeClusterJson, type OpinionClusterResult } from '../lib/opinionClusters'
import type { Comment } from '../lib/opinions'
import { basename } from '../lib/path'
import { clusterName } from './clusterName'
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
  /**
   * device は、モデルを動かした手段です（キャッシュから読んだ場合は null）。
   * cacheError は、結果をキャッシュに保存できなかった理由です（保存できた・キャッシュから読んだ場合は null）。
   * embeddingKey は、埋め込みのキャッシュのキーです（ラベルのキャッシュのキーにも使います）。
   */
  | { status: 'done'; embeddings: number[][]; device: EmbeddingDevice | null; cacheError: string | null; embeddingKey: string }
  | { status: 'error'; message: string }

/** 既定のクラスタ数です（意見の件数が少なければ件数にします）。 */
const DEFAULT_CLUSTER_COUNT = 5
/** 選べるクラスタ数の上限です。 */
const MAX_CLUSTER_COUNT = 12
/** ラベルの根拠として LLM に渡す、クラスタの代表的な意見の件数です。 */
const BASIS_COMMENT_COUNT = 10
/** モデルを動かした手段の表示名です。 */
const DEVICE_LABELS: Record<EmbeddingDevice, string> = { webgpu: 'WebGPU', wasm: 'WASM' }
/** バイトをメガバイトにする割る数です。 */
const BYTES_PER_MEGABYTE = 1_000_000

/** 埋め込み・ラベルの生成の進捗を表示します。 */
function ProgressView({ progress, preparingLabel }: { progress: EmbeddingProgress | null; preparingLabel: string }) {
  if (!progress) return <p className="muted">{preparingLabel}</p>
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

/** ラベルの生成の状態です。 */
type LabelingState =
  | { status: 'idle' }
  | { status: 'running'; clusterId: number; progress: GenerationProgress | null }
  /** モデルの読み込みなど、クラスタに依らない失敗です。 */
  | { status: 'error'; message: string }

/** 分析結果に、LLM によるラベルの生成を加えた部分です。クラスタ数ごとに作り直します。 */
function LabeledClusters({ path, result, deps, embeddingKey }: { path: string; result: OpinionClusterResult; deps: OpinionAnalysisDeps; embeddingKey: string }) {
  const { embedder, labeler, cache } = deps
  const labelKey = `labels:${embeddingKey}:${result.clusters.length}:${labeler.modelId}`
  const [support, setSupport] = useState<LabelerSupport | null>(null)
  const [labels, setLabels] = useState<ClusterLabel[]>([])
  const [failures, setFailures] = useState<{ clusterId: number; message: string }[]>([])
  const [labeling, setLabeling] = useState<LabelingState>({ status: 'idle' })
  const [cacheError, setCacheError] = useState<string | null>(null)

  // この環境で LLM を動かせるかを調べ、同じ入力・クラスタ数のラベルがキャッシュにあれば表示します
  useEffect(() => {
    let cancelled = false
    labeler.checkSupport().then((value) => {
      if (!cancelled) setSupport(value)
    })
    cache.get<ClusterLabel[]>(labelKey).then(
      (cached) => {
        if (!cancelled && cached) setLabels(cached)
      },
      (cause: unknown) => {
        if (!cancelled) setCacheError(`ラベルのキャッシュを読めませんでした: ${cause instanceof Error ? cause.message : String(cause)}`)
      },
    )
    return () => {
      cancelled = true
    }
  }, [labeler, cache, labelKey])

  const generate = async () => {
    const generated: ClusterLabel[] = []
    const failed: { clusterId: number; message: string }[] = []
    setFailures([])
    try {
      for (const cluster of result.clusters) {
        setLabeling({ status: 'running', clusterId: cluster.id, progress: null })
        const basis = pickBasisComments(result, cluster.id, BASIS_COMMENT_COUNT)
        const output = await labeler.generate(buildLabelMessages(basis), (progress) => setLabeling({ status: 'running', clusterId: cluster.id, progress }))
        // 出力が想定の形式でないクラスタは、空のラベルにせず失敗として記録し、ほかのクラスタの生成は続けます
        try {
          generated.push({ clusterId: cluster.id, ...parseLabelOutput(output), basisCommentIds: basis.map((comment) => comment.id) })
        } catch (cause) {
          failed.push({ clusterId: cluster.id, message: cause instanceof Error ? cause.message : String(cause) })
        }
      }
    } catch (cause) {
      setLabeling({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      return
    }
    setLabels(generated)
    setFailures(failed)
    setLabeling({ status: 'idle' })
    try {
      await cache.set(labelKey, generated)
      setCacheError(null)
    } catch (cause) {
      setCacheError(`ラベルをキャッシュに保存できませんでした: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const exportJson = () => {
    const meta = labels.length > 0 ? { labelModelId: labeler.modelId, labels } : {}
    downloadJson(serializeClusterJson(result, { modelId: embedder.modelId, source: path, ...meta }), `${basename(path).replace(/\.csv$/i, '')}-clusters.json`)
  }

  return (
    <>
      <p className="analysis-toolbar">
        <button type="button" className="button" onClick={exportJson}>
          JSON を書き出す
        </button>
        {support?.ok && labeling.status !== 'running' && (
          <button type="button" className="button" onClick={generate}>
            ラベルを生成
          </button>
        )}
      </p>
      <p className="muted">
        {`埋め込みモデル: ${embedder.modelId}。書き出した JSON を raw/ に置くと、モデル無しでこの結果を表示できます。ラベルは、各クラスタの代表的な意見（中心に近い順に最大 ${BASIS_COMMENT_COUNT} 件）からブラウザ内の LLM（${labeler.modelId}。初回は ${labeler.downloadSizeLabel} をダウンロード）で生成します。`}
      </p>
      {support && !support.ok && <p className="lint-unavailable">{support.reason}</p>}
      {labeling.status === 'running' && (
        <>
          <p className="muted">{`${clusterName(labeling.clusterId)} / ${result.clusters.length} のラベルを生成しています…`}</p>
          {labeling.progress?.phase === 'download' && <ProgressView progress={labeling.progress} preparingLabel="LLM を準備しています…" />}
        </>
      )}
      {labeling.status === 'error' && (
        <p role="alert" className="error-banner">
          {`ラベルを生成できませんでした: ${labeling.message}`}
        </p>
      )}
      {failures.map((failure) => (
        <p key={failure.clusterId} role="alert" className="error-banner">
          {`${clusterName(failure.clusterId)} のラベルを生成できませんでした: ${failure.message}`}
        </p>
      ))}
      {cacheError && <p className="lint-unavailable">{cacheError}</p>}
      <OpinionClustersView result={result} labels={labels} />
    </>
  )
}

/** 埋め込みの結果から、クラスタ数を選べる分析結果の画面を描画します。 */
function AnalysisResult({ path, comments, embeddings, deps, embeddingKey }: { path: string; comments: Comment[]; embeddings: number[][]; deps: OpinionAnalysisDeps; embeddingKey: string }) {
  const [clusterCount, setClusterCount] = useState(Math.min(DEFAULT_CLUSTER_COUNT, comments.length))
  const selectId = useId()
  const result = useMemo(() => clusterOpinions(comments, embeddings, clusterCount), [comments, embeddings, clusterCount])
  const options = Array.from({ length: Math.min(MAX_CLUSTER_COUNT, comments.length) }, (_, index) => index + 1)
  return (
    <>
      <p className="analysis-toolbar">
        <label htmlFor={selectId}>クラスタ数</label>
        <select id={selectId} value={clusterCount} onChange={(event) => setClusterCount(Number(event.target.value))}>
          {options.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </p>
      {/* クラスタ数を変えたら、選んでいたクラスタ・生成したラベルを作り直します */}
      <LabeledClusters key={clusterCount} path={path} result={result} deps={deps} embeddingKey={embeddingKey} />
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
      .then(async (key) => ({ key, cached: await cache.get<CachedEmbeddings>(key) }))
      .then(
        ({ key, cached }) => {
          if (!cancelled) setState(cached ? { status: 'done', embeddings: cached.embeddings, device: null, cacheError: null, embeddingKey: key } : { status: 'idle' })
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
      const { embeddings, device } = await embedder.embed(
        comments.map((comment) => comment.body),
        (progress) => setState({ status: 'running', progress }),
      )
      // 時間のかかる埋め込みは終わっているため、キャッシュに保存できなくても結果は表示し、保存できなかったことを示します
      const embeddingKey = await analysisCacheKey(csvText, embedder.modelId)
      let cacheError: string | null = null
      try {
        await cache.set(embeddingKey, { modelId: embedder.modelId, embeddings } satisfies CachedEmbeddings)
      } catch (cause) {
        cacheError = cause instanceof Error ? cause.message : String(cause)
      }
      setState({ status: 'done', embeddings, device, cacheError, embeddingKey })
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
      return <ProgressView progress={state.progress} preparingLabel="埋め込みモデルを準備しています…" />
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
      return (
        <>
          <p className="muted">
            {state.device === null ? '以前に分析した結果（キャッシュ）を表示しています。' : `${DEVICE_LABELS[state.device]} で計算しました。`}
          </p>
          {state.cacheError && <p className="lint-unavailable">{`結果をキャッシュに保存できませんでした（次に開いたときは分析し直します）: ${state.cacheError}`}</p>}
          <AnalysisResult path={path} comments={comments} embeddings={state.embeddings} deps={deps} embeddingKey={state.embeddingKey} />
        </>
      )
  }
}

/** 意見 CSV の分析パネルです。意見の分析の依存が提供されていない場合は何も表示しません。 */
export function OpinionAnalysisPanel(props: OpinionAnalysisPanelProps) {
  const deps = useContext(OpinionAnalysisContext)
  // 意見 CSV の内容が変わったら状態を作り直し、前の内容の埋め込みを新しい意見に使わないようにします
  return deps ? <Panel key={props.csvText} deps={deps} {...props} /> : null
}
