/**
 * ラベルを生成する LLM を動かす Web Worker です。
 *
 * Transformers.js v4 の text-generation のパイプラインを WebGPU で動かし、チャットのメッセージへの応答を返します。
 * Qwen3.5 は応答の前に考える過程を出力する思考モードを持つため、チャットテンプレートの enable_thinking を false にして JSON だけを出力させます。
 * 出力は再現できるように、サンプリングせずに最も確からしい語を選びます（do_sample: false）。
 */
import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers'
import type { ChatMessage } from '../lib/clusterLabels'
import { createDownloadProgressCallback, serveWorker } from '../worker/rpc'
import { LABEL_MODEL_ID, type GenerationProgress } from './labeler'

/** 応答の長さの上限（トークン数）です。見出しと説明の JSON に足りる長さにします。 */
const MAX_NEW_TOKENS = 256

let loading: Promise<TextGenerationPipeline> | null = null
/**
 * 進捗を知らせる先（いま処理中の依頼）です。パイプラインの読み込み中に次の依頼が来た場合も、その依頼にダウンロードの進捗が届くようにします。
 */
let activeReport: ((progress: GenerationProgress) => void) | null = null

serveWorker<ChatMessage[], string, GenerationProgress>(async (messages, report) => {
  activeReport = report
  loading ??= pipeline('text-generation', LABEL_MODEL_ID, {
    device: 'webgpu',
    dtype: 'q4f16',
    progress_callback: createDownloadProgressCallback((progress) => activeReport?.(progress)),
  })
  let generator: TextGenerationPipeline
  try {
    generator = await loading
  } catch (cause) {
    // 読み込みに失敗したパイプラインは使い回さず、次の依頼で読み込み直します
    loading = null
    throw cause
  }
  report({ phase: 'generating' })
  const output = await generator(messages, { max_new_tokens: MAX_NEW_TOKENS, do_sample: false, tokenizer_encode_kwargs: { enable_thinking: false } })
  // チャットの入力に対する出力は、入力のメッセージに応答のメッセージを加えた配列です
  const generated = Array.isArray(output) ? output[0] : output
  const conversation = generated && 'generated_text' in generated ? generated.generated_text : null
  const reply = Array.isArray(conversation) ? conversation.at(-1) : null
  if (!reply || typeof reply.content !== 'string') throw new Error('LLM の応答を取り出せませんでした。')
  return reply.content
})
