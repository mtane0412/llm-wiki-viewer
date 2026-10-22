/**
 * WebGPU で 16 ビット浮動小数点数（shader-f16）のモデルを動かせるかを調べるモジュールです。
 *
 * 埋め込みモデル（WebGPU か WASM かの選択）と LLM（ラベルを生成できるかの判定）で同じ判定を使います。
 * 画面と Web Worker のどちらからでも呼べます（navigator.gpu は Worker でも使えます）。
 */

/** 判定の結果です。動かせない場合は、画面に示す理由を持ちます。 */
export type WebGpuSupport = { ok: true } | { ok: false; reason: string }

/**
 * WebGPU で 16 ビット浮動小数点数のモデルを動かせるかを調べます。
 *
 * @returns 判定の結果
 */
export async function checkWebGpuFp16(): Promise<WebGpuSupport> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    return { ok: false, reason: 'このブラウザは WebGPU に対応していません。Chrome・Edge の最新版で開くと使えます。' }
  }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return { ok: false, reason: 'WebGPU で使える GPU が見つかりません。' }
    if (!adapter.features.has('shader-f16')) return { ok: false, reason: 'GPU が 16 ビット浮動小数点数（shader-f16）に対応していません。' }
    return { ok: true }
  } catch (cause) {
    // ブラウザやドライバーによっては requestAdapter が例外を投げるため、WebGPU を使えない環境として扱います
    return { ok: false, reason: `WebGPU を初期化できません（${cause instanceof Error ? cause.message : String(cause)}）。` }
  }
}
