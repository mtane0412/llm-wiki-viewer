/**
 * 埋め込みモデルを動かす Web Worker です。
 *
 * Transformers.js v4 の feature-extraction のパイプラインで、意見の本文を平均プーリング・正規化したベクトルにします。
 * パイプラインは最初の依頼で読み込み、以後は使い回します。進捗（ダウンロード・埋め込みの件数）は src/worker/rpc.ts の仕組みで送り返します。
 */
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { createDownloadProgressCallback, serveWorker } from '../worker/rpc'
import { EMBEDDING_MODEL_ID, EMBEDDING_PREFIX, type EmbeddingDevice, type EmbeddingOutput, type EmbeddingProgress } from './embedder'

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
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter?.features.has('shader-f16') ?? false
  } catch {
    // ブラウザやドライバーによっては requestAdapter が例外を投げるため、WebGPU を使えない環境として扱います
    return false
  }
}

/** 指定した手段でパイプラインを作ります。ダウンロードの進捗は全ファイルの合計にして知らせます。 */
async function createPipeline(device: EmbeddingDevice, report: (progress: EmbeddingProgress) => void): Promise<FeatureExtractionPipeline> {
  return pipeline('feature-extraction', EMBEDDING_MODEL_ID, {
    device,
    dtype: device === 'webgpu' ? 'fp16' : 'q8',
    progress_callback: createDownloadProgressCallback(report),
  })
}

/**
 * パイプラインを読み込みます。WebGPU で動かせる環境では WebGPU で作り、作れなかった場合は WASM で 1 度だけ作り直します。
 * どちらで動かしたかは結果の device で画面に返すため、暗黙には切り替わりません。
 */
async function loadPipeline(report: (progress: EmbeddingProgress) => void): Promise<LoadedPipeline> {
  if (await supportsWebGpuFp16()) {
    try {
      return { extractor: await createPipeline('webgpu', report), device: 'webgpu' }
    } catch {
      // WebGPU の初期化に失敗するドライバーがあるため、WASM で作り直します（WASM でも失敗した場合はその例外を返します）
    }
  }
  return { extractor: await createPipeline('wasm', report), device: 'wasm' }
}

serveWorker<string[], EmbeddingOutput, EmbeddingProgress>(async (texts, report) => {
  loading ??= loadPipeline(report)
  let loaded: LoadedPipeline
  try {
    loaded = await loading
  } catch (cause) {
    // 読み込みに失敗したパイプラインは使い回さず、次の依頼で読み込み直します
    loading = null
    throw cause
  }
  const embeddings: number[][] = []
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE).map((text) => `${EMBEDDING_PREFIX}${text}`)
    const output = await loaded.extractor(batch, { pooling: 'mean', normalize: true })
    embeddings.push(...(output.tolist() as number[][]))
    report({ phase: 'embedding', done: embeddings.length, total: texts.length })
  }
  return { embeddings, device: loaded.device }
})
