/**
 * 意見の分析（意見クラスタ）に使う依存を、画面の部品に渡すための React のコンテキストです。
 *
 * 本番では Web Worker の埋め込みモデル・LLM と IndexedDB のキャッシュを、テストでは偽の実装とメモリ上の保存先を渡します。
 * 提供されていない場合（null）は、意見 CSV の分析ボタンを表示しません。
 */
import { createContext } from 'react'
import type { Embedder } from '../embedding/embedder'
import type { Labeler } from '../llm/labeler'
import type { KeyValueStore } from '../source/vaultRegistry'

/** 意見の分析の依存です。 */
export interface OpinionAnalysisDeps {
  embedder: Embedder
  /** 意見クラスタのラベル（見出しと説明）を生成する LLM です。 */
  labeler: Labeler
  /** 埋め込みとラベルの結果のキャッシュの保存先です（キーは入力の内容とモデルのハッシュをもとにします）。 */
  cache: KeyValueStore
}

/** 意見の分析の依存のコンテキストです。 */
export const OpinionAnalysisContext = createContext<OpinionAnalysisDeps | null>(null)
