import { describe, expect, it, vi } from 'vitest'
import { createDownloadProgressCallback, createWorkerCaller, type WorkerRequest, type WorkerResponse } from './rpc'

/**
 * Worker の代わりです。受け取った依頼に、指定した応答を返します。
 * respond は依頼の id と内容から、返すメッセージの列を作ります。
 */
function createFakeWorker(respond: (request: WorkerRequest<string>) => WorkerResponse<string, number>[]) {
  const target = new EventTarget()
  const worker = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    postMessage: vi.fn((request: WorkerRequest<string>) => {
      queueMicrotask(() => {
        for (const message of respond(request)) target.dispatchEvent(new MessageEvent('message', { data: message }))
      })
    }),
  }
  return worker as unknown as Worker
}

describe('createWorkerCaller', () => {
  it('依頼を Worker に送り、進捗を知らせてから結果を返す', async () => {
    const worker = createFakeWorker((request) => [
      { id: request.id, type: 'progress', progress: 50 },
      { id: request.id, type: 'result', output: `${request.payload}を処理しました` },
    ])
    const call = createWorkerCaller<string, string, number>(() => worker)
    const onProgress = vi.fn()
    await expect(call('意見の埋め込み', onProgress)).resolves.toBe('意見の埋め込みを処理しました')
    expect(onProgress).toHaveBeenCalledWith(50)
  })

  it('Worker がエラーを返した場合は、その理由で失敗する', async () => {
    const worker = createFakeWorker((request) => [{ id: request.id, type: 'error', message: 'モデルを取得できません' }])
    const call = createWorkerCaller<string, string, number>(() => worker)
    await expect(call('意見の埋め込み', vi.fn())).rejects.toThrow('モデルを取得できません')
  })

  it('Worker は最初の依頼で 1 度だけ作り、ほかの依頼の応答は受け取らない', async () => {
    const worker = createFakeWorker((request) => [
      // 前提: 別の依頼（id が違う）の結果が先に届きます
      { id: request.id + 100, type: 'result', output: '別の依頼の結果' },
      { id: request.id, type: 'result', output: `${request.payload}の結果` },
    ])
    const createWorker = vi.fn(() => worker)
    const call = createWorkerCaller<string, string, number>(createWorker)
    await expect(call('1 回目', vi.fn())).resolves.toBe('1 回目の結果')
    await expect(call('2 回目', vi.fn())).resolves.toBe('2 回目の結果')
    expect(createWorker).toHaveBeenCalledTimes(1)
  })
})

describe('createDownloadProgressCallback', () => {
  it('ファイルごとのダウンロードの進捗を、全ファイルの合計にして知らせる', () => {
    const report = vi.fn()
    const callback = createDownloadProgressCallback(report)
    callback({ status: 'progress', file: 'model.onnx', loaded: 10, total: 100 })
    callback({ status: 'progress', file: 'tokenizer.json', loaded: 5, total: 20 })
    callback({ status: 'progress', file: 'model.onnx', loaded: 60, total: 100 })
    expect(report).toHaveBeenLastCalledWith({ phase: 'download', loadedBytes: 65, totalBytes: 120 })
  })

  it('進捗以外の通知（ダウンロードの開始・完了など）は知らせない', () => {
    const report = vi.fn()
    createDownloadProgressCallback(report)({ status: 'done', file: 'model.onnx' })
    expect(report).not.toHaveBeenCalled()
  })
})
