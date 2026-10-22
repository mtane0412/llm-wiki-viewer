/**
 * ブラウザ内の埋め込みモデルで、意見の本文をベクトルにするモジュールです。
 *
 * モデル（Transformers.js v4）は Web Worker の中で動かし、画面を止めません。意見は端末の外に送りません。
 * モデルのファイルと ONNX Runtime の wasm はブラウザのキャッシュ（Cache API）に保存されるため、初回のダウンロード後はネットワークが無くても動きます。
 *
 * モデル: sirasagi62/ruri-v3-30m-ONNX（名古屋大学の日本語埋め込みモデル Ruri v3 30m の ONNX 版。Apache-2.0。256 次元）
 * - WebGPU が使え、16 ビット浮動小数点数（shader-f16）に対応する環境では fp16 版（約 74 MB）を WebGPU で動かします
 * - それ以外の環境では 8 ビット量子化版（約 37 MB）を WASM で動かします
 */
import { createWorkerCaller, type DownloadProgress } from '../worker/rpc'

/** 埋め込みモデルの id（Hugging Face のリポジトリ名）です。 */
export const EMBEDDING_MODEL_ID = 'sirasagi62/ruri-v3-30m-ONNX'

/**
 * 埋め込みの前に意見の本文に付ける接頭辞です。
 * Ruri v3 は用途ごとに接頭辞を使い分け、分類・クラスタリングには「トピック: 」を使います。
 */
export const EMBEDDING_PREFIX = 'トピック: '

/** モデルを動かした手段です。 */
export type EmbeddingDevice = 'webgpu' | 'wasm'

/** 埋め込みの進捗です。 */
export type EmbeddingProgress =
  /** モデルのファイルのダウンロードの進捗です（全ファイルの合計）。 */
  | DownloadProgress
  /** 埋め込みを終えた意見の件数です。 */
  | { phase: 'embedding'; done: number; total: number }

/** 埋め込みの結果です。 */
export interface EmbeddingOutput {
  /** 入力と同じ順の、長さ 1 に正規化したベクトルです。 */
  embeddings: number[][]
  device: EmbeddingDevice
}

/** 埋め込みモデルです。テストでは偽の実装に差し替えます。 */
export interface Embedder {
  /** モデルの id です。キャッシュのキーと書き出す JSON に使います。 */
  modelId: string
  /** 初回にダウンロードするモデルの大きさの説明です。 */
  downloadSizeLabel: string
  /**
   * 文章をベクトルにします。
   *
   * @param texts - 意見の本文（接頭辞は付けずに渡します）
   * @param onProgress - 進捗を受け取る関数
   * @returns ベクトルと、モデルを動かした手段
   */
  embed(texts: string[], onProgress: (progress: EmbeddingProgress) => void): Promise<EmbeddingOutput>
}

/**
 * Web Worker でモデルを動かす埋め込みモデルを作ります。Worker は最初に embed を呼んだときに起動し、以後は使い回します。
 *
 * @returns 埋め込みモデル
 */
export function createWorkerEmbedder(): Embedder {
  const call = createWorkerCaller<string[], EmbeddingOutput, EmbeddingProgress>(() => new Worker(new URL('./embedWorker.ts', import.meta.url), { type: 'module' }))
  return {
    modelId: EMBEDDING_MODEL_ID,
    downloadSizeLabel: '約 44 MB（WebGPU で動かす場合は約 80 MB）',
    embed: call,
  }
}
