/**
 * ブラウザ内の LLM で、意見クラスタのラベル（見出しと説明）を生成するモジュールです。
 *
 * LLM（Transformers.js v4 の text-generation）は Web Worker の中で WebGPU で動かします。意見は端末の外に送りません。
 * モデルのファイルはブラウザのキャッシュ（Cache API）に保存されるため、初回のダウンロード後はネットワークが無くても動きます。
 *
 * モデル: onnx-community/Qwen3.5-0.8B-Text-ONNX（Qwen3.5 0.8B のテキスト専用の ONNX 版。元のモデルは Apache-2.0）
 * - 4 ビット量子化・16 ビット浮動小数点数の版（q4f16、トークナイザーと合わせて約 490 MB）を WebGPU で動かします
 * - WASM では 0.8B のモデルの生成が遅すぎるため、WebGPU が使えない環境ではラベル付けを実行できないことを理由とともに示します
 */
import type { ChatMessage } from '../lib/clusterLabels'
import { createWorkerCaller, type DownloadProgress } from '../worker/rpc'
import { checkWebGpuFp16, type WebGpuSupport } from '../worker/webgpu'

/** LLM の id（Hugging Face のリポジトリ名）です。 */
export const LABEL_MODEL_ID = 'onnx-community/Qwen3.5-0.8B-Text-ONNX'

/** ラベルの生成の進捗です。 */
export type GenerationProgress = DownloadProgress | { phase: 'generating' }

/** この環境でラベルを生成できるかの判定です。 */
export type LabelerSupport = WebGpuSupport

/** ラベルを生成する LLM です。テストでは偽の実装に差し替えます。 */
export interface Labeler {
  /** モデルの id です。キャッシュのキーと書き出す JSON に使います。 */
  modelId: string
  /** 初回にダウンロードするモデルの大きさの説明です。 */
  downloadSizeLabel: string
  /** この環境でラベルを生成できるか（WebGPU が使えるか）を調べます。 */
  checkSupport(): Promise<LabelerSupport>
  /**
   * メッセージに対する LLM の応答を生成します。
   *
   * @param messages - LLM に渡すメッセージ
   * @param onProgress - 進捗を受け取る関数
   * @returns LLM の応答の文字列
   */
  generate(messages: ChatMessage[], onProgress: (progress: GenerationProgress) => void): Promise<string>
}

/**
 * Web Worker で LLM を動かすラベルの生成器を作ります。Worker は最初に generate を呼んだときに起動し、以後は使い回します。
 *
 * @returns ラベルの生成器
 */
export function createWorkerLabeler(): Labeler {
  const call = createWorkerCaller<ChatMessage[], string, GenerationProgress>(() => new Worker(new URL('./labelWorker.ts', import.meta.url), { type: 'module' }))
  return {
    modelId: LABEL_MODEL_ID,
    downloadSizeLabel: '約 490 MB',
    checkSupport: async () => {
      const support = await checkWebGpuFp16()
      return support.ok ? support : { ok: false, reason: `${support.reason}そのため、ブラウザ内の LLM でラベルを生成できません。` }
    },
    generate: call,
  }
}
