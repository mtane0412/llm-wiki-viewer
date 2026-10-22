/**
 * 埋め込みモデルを動かす Web Worker です。
 *
 * Transformers.js v4 の feature-extraction のパイプラインで、意見の本文を平均プーリング・正規化したベクトルにします。
 * パイプラインは最初の依頼で読み込み、以後は使い回します。進捗（ダウンロード・埋め込みの件数）は依頼の id を付けて送り返します。
 */
import { pipeline, type FeatureExtractionPipeline, type ProgressInfo } from '@huggingface/transformers'
import { EMBEDDING_MODEL_ID, EMBEDDING_PREFIX, type EmbedRequest, type EmbedResponse, type EmbeddingDevice, type EmbeddingProgress } from './embedder'

/** 1 回にまとめて埋め込む意見の件数です。進捗を細かく知らせ、メモリの使用量を抑えるために分けます。 */
const BATCH_SIZE = 16

/** 読み込んだパイプラインと、動かした手段です。 */
interface LoadedPipeline {
  extractor: FeatureExtractionPipeline
  device: EmbeddingDevice
}

let loading: Promise<LoadedPipeline> | null = null

/** WebGPU で fp16 のモデルを動かせるかを調べます。 */
async function supportsWebGpuFp16(): Promise<boolean> {
  if (!('gpu' in navigator) || !navigator.gpu) return false
  const adapter = await navigator.gpu.requestAdapter()
  return adapter?.features.has('shader-f16') ?? false
}

/** パイプラインを読み込みます。ダウンロードの進捗は全ファイルの合計にして知らせます。 */
async function loadPipeline(report: (progress: EmbeddingProgress) => void): Promise<LoadedPipeline> {
  const device: EmbeddingDevice = (await supportsWebGpuFp16()) ? 'webgpu' : 'wasm'
  const files = new Map<string, { loaded: number; total: number }>()
  const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL_ID, {
    device,
    dtype: device === 'webgpu' ? 'fp16' : 'q8',
    progress_callback: (info: ProgressInfo) => {
      if (info.status !== 'progress') return
      files.set(info.file, { loaded: info.loaded, total: info.total })
      const totals = [...files.values()].reduce((sum, file) => ({ loaded: sum.loaded + file.loaded, total: sum.total + file.total }), { loaded: 0, total: 0 })
      report({ phase: 'download', loadedBytes: totals.loaded, totalBytes: totals.total })
    },
  })
  return { extractor, device }
}

self.addEventListener('message', (event: MessageEvent<EmbedRequest>) => {
  const { id, texts } = event.data
  const send = (message: EmbedResponse) => self.postMessage(message)
  const report = (progress: EmbeddingProgress) => send({ id, type: 'progress', progress })
  ;(async () => {
    loading ??= loadPipeline(report)
    const { extractor, device } = await loading
    const embeddings: number[][] = []
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE).map((text) => `${EMBEDDING_PREFIX}${text}`)
      const output = await extractor(batch, { pooling: 'mean', normalize: true })
      embeddings.push(...(output.tolist() as number[][]))
      report({ phase: 'embedding', done: embeddings.length, total: texts.length })
    }
    send({ id, type: 'result', output: { embeddings, device } })
  })().catch((cause: unknown) => {
    // 読み込みに失敗したパイプラインは使い回さず、次の依頼で読み込み直します
    loading = null
    send({ id, type: 'error', message: cause instanceof Error ? cause.message : String(cause) })
  })
})
