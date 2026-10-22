/**
 * 画面（メインスレッド）と Web Worker の間で、依頼・進捗・結果を受け渡す仕組みです。
 *
 * 埋め込みモデルと LLM はどちらも Worker の中で動かし、次の形のメッセージをやり取りします。
 * - 画面 → Worker: 依頼（id と内容）
 * - Worker → 画面: 進捗・結果・エラー（依頼の id 付き）
 * あわせて、Transformers.js のファイルごとのダウンロードの進捗を全ファイルの合計にまとめる関数を置きます。
 */

/** 画面から Worker に送る依頼です。 */
export interface WorkerRequest<TPayload> {
  id: number
  payload: TPayload
}

/** Worker から画面に届くメッセージです。 */
export type WorkerResponse<TResult, TProgress> =
  | { id: number; type: 'progress'; progress: TProgress }
  | { id: number; type: 'result'; output: TResult }
  | { id: number; type: 'error'; message: string }

/** モデルのダウンロードの進捗です（全ファイルの合計）。 */
export interface DownloadProgress {
  phase: 'download'
  loadedBytes: number
  totalBytes: number
}

/**
 * Worker に依頼を送り、結果を待つ関数を作ります。Worker は最初の依頼のときに作り、以後は使い回します。
 *
 * @param createWorker - Worker を作る関数
 * @returns 依頼の内容と進捗を受け取る関数を引数に、結果を返す関数
 */
export function createWorkerCaller<TPayload, TResult, TProgress>(
  createWorker: () => Worker,
): (payload: TPayload, onProgress: (progress: TProgress) => void) => Promise<TResult> {
  let worker: Worker | null = null
  let nextId = 0
  return (payload, onProgress) => {
    worker ??= createWorker()
    const current = worker
    const id = nextId++
    return new Promise<TResult>((resolve, reject) => {
      const cleanUp = () => {
        current.removeEventListener('message', handleMessage)
        current.removeEventListener('error', handleError)
      }
      const handleMessage = (event: MessageEvent<WorkerResponse<TResult, TProgress>>) => {
        const message = event.data
        if (message.id !== id) return
        if (message.type === 'progress') {
          onProgress(message.progress)
          return
        }
        cleanUp()
        if (message.type === 'result') resolve(message.output)
        else reject(new Error(message.message))
      }
      const handleError = (event: ErrorEvent) => {
        cleanUp()
        reject(new Error(`Worker でエラーが起きました: ${event.message}`))
      }
      current.addEventListener('message', handleMessage)
      current.addEventListener('error', handleError)
      current.postMessage({ id, payload } satisfies WorkerRequest<TPayload>)
    })
  }
}

/**
 * Worker の中で依頼を受け付けます。依頼ごとに handler を呼び、進捗・結果・エラーを依頼の id を付けて送り返します。
 *
 * @param handler - 依頼の内容と、進捗を知らせる関数を受け取り、結果を返す関数
 */
export function serveWorker<TPayload, TResult, TProgress>(handler: (payload: TPayload, report: (progress: TProgress) => void) => Promise<TResult>): void {
  self.addEventListener('message', (event: MessageEvent<WorkerRequest<TPayload>>) => {
    const { id, payload } = event.data
    const send = (message: WorkerResponse<TResult, TProgress>) => self.postMessage(message)
    handler(payload, (progress) => send({ id, type: 'progress', progress })).then(
      (output) => send({ id, type: 'result', output }),
      (cause: unknown) => send({ id, type: 'error', message: cause instanceof Error ? cause.message : String(cause) }),
    )
  })
}

/** Transformers.js がモデルの読み込み中に知らせる情報のうち、ダウンロードの進捗に使う部分です。 */
export interface ModelLoadingInfo {
  status: string
  file?: string
  loaded?: number
  total?: number
}

/**
 * Transformers.js の progress_callback に渡す関数を作ります。ファイルごとの進捗を、全ファイルの合計にして知らせます。
 *
 * @param report - 合計の進捗を受け取る関数
 * @returns progress_callback に渡す関数
 */
export function createDownloadProgressCallback(report: (progress: DownloadProgress) => void): (info: ModelLoadingInfo) => void {
  const files = new Map<string, { loaded: number; total: number }>()
  return (info) => {
    if (info.status !== 'progress' || info.file === undefined) return
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 })
    let loadedBytes = 0
    let totalBytes = 0
    for (const file of files.values()) {
      loadedBytes += file.loaded
      totalBytes += file.total
    }
    report({ phase: 'download', loadedBytes, totalBytes })
  }
}
