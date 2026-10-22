import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpinionAnalysisContext, type OpinionAnalysisDeps } from '../app/opinionAnalysis'
import type { Embedder, EmbeddingProgress } from '../embedding/embedder'
import type { ChatMessage } from '../lib/clusterLabels'
import type { Labeler, LabelerSupport } from '../llm/labeler'
import { parseClusterJson } from '../lib/opinionClusters'
import type { KeyValueStore } from '../source/vaultRegistry'
import { buildWikiIndex } from '../lib/wikiIndex'
import { CsvFileView } from './CsvFileView'
import { OpinionAnalysisPanel } from './OpinionAnalysisPanel'

/** 給食の意見 3 件と公園の意見 2 件の意見 CSV です。 */
const commentsCsv = [
  'comment-id,comment-body',
  'c1,給食を無償にしてほしい',
  'c2,給食の量を増やしてほしい',
  'c3,給食に地元の野菜を使ってほしい',
  'c4,公園を増やしたい',
  'c5,公園にトイレがほしい',
].join('\n')

const path = 'raw/survey/comments.csv'
const index = buildWikiIndex({ markdownFiles: [], unloadedMarkdownPaths: [], assetPaths: [path] })
const readText = vi.fn(async () => commentsCsv)

/** IndexedDB の代わりに使うメモリ上のキー・バリューストアです。 */
function createMemoryStore(): KeyValueStore {
  const map = new Map<string, unknown>()
  return {
    get: async <T,>(key: string) => map.get(key) as T | undefined,
    set: async (key: string, value: unknown) => {
      map.set(key, value)
    },
  }
}

/**
 * 埋め込みモデルの代わりです。「給食」を含む意見と含まない意見を、別の向きのベクトルにします。
 * 呼ばれるとモデルのダウンロードの途中経過（44 MB のうち 22 MB）を知らせます。
 */
function createFakeEmbedder(): Embedder & { embed: ReturnType<typeof vi.fn> } {
  return {
    modelId: 'テスト用の埋め込みモデル',
    downloadSizeLabel: '約 44 MB',
    embed: vi.fn(async (texts: string[], onProgress: (progress: EmbeddingProgress) => void) => {
      onProgress({ phase: 'download', loadedBytes: 22_000_000, totalBytes: 44_000_000 })
      return { embeddings: texts.map((text) => (text.includes('給食') ? [1, 0.1] : [0.1, 1])), device: 'wasm' as const }
    }),
  }
}

/**
 * LLM の代わりです。給食の意見を渡されたら給食の、それ以外なら公園のラベルを JSON で返します。
 * support で、この環境でラベルを生成できるかの判定を指定します。
 */
function createFakeLabeler(support: LabelerSupport = { ok: true }): Labeler & { generate: ReturnType<typeof vi.fn> } {
  return {
    modelId: 'テスト用の LLM',
    downloadSizeLabel: '約 490 MB',
    checkSupport: vi.fn(async () => support),
    generate: vi.fn(async (messages: ChatMessage[]) =>
      messages.some((message) => message.content.includes('給食'))
        ? '{"label": "給食の改善", "description": "給食の費用と内容の改善を求める意見です。"}'
        : '{"label": "公園の整備", "description": "公園の数と設備の充実を求める意見です。"}',
    ),
  }
}

/** 意見 CSV の画面を、意見の分析の依存とともに描画します。 */
function renderPanel(deps: OpinionAnalysisDeps) {
  return render(
    <OpinionAnalysisContext.Provider value={deps}>
      <CsvFileView path={path} index={index} readText={readText} />
    </OpinionAnalysisContext.Provider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('意見 CSV の意見の分析', () => {
  it('分析する前に、モデルの初回のダウンロードの大きさを示す', async () => {
    renderPanel({ embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache: createMemoryStore() })
    expect(await screen.findByRole('button', { name: '意見を分析' })).toBeInTheDocument()
    expect(screen.getByText(/約 44 MB/)).toBeInTheDocument()
  })

  it('分析すると意見をクラスタに分け、クラスタを選ぶと属する意見の原文を comment-id 付きで一覧する', async () => {
    const user = userEvent.setup()
    renderPanel({ embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache: createMemoryStore() })
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    // 前提: 既定のクラスタ数は、意見が 5 件なので 5 になります。2 つに分けるために 2 を選びます
    await user.selectOptions(await screen.findByRole('combobox', { name: 'クラスタ数' }), '2')

    await user.click(screen.getByRole('button', { name: /クラスタ 1（3 件）/ }))
    const list = screen.getByRole('list', { name: 'クラスタ 1 の意見' })
    expect(within(list).getByText('給食を無償にしてほしい')).toBeInTheDocument()
    expect(within(list).getByText('c1')).toBeInTheDocument()
    expect(within(list).queryByText('公園を増やしたい')).toBeNull()
    expect(screen.getByRole('img', { name: /5 件の意見/ })).toBeInTheDocument()
    // モデルを動かした手段（WebGPU・WASM）を示します
    expect(screen.getByText(/WASM で計算しました/)).toBeInTheDocument()
  })

  it('同じ内容の意見 CSV は、キャッシュした結果を表示して再計算しない', async () => {
    const embedder = createFakeEmbedder()
    const cache = createMemoryStore()
    const user = userEvent.setup()
    const { unmount } = renderPanel({ embedder, labeler: createFakeLabeler(), cache })
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    await screen.findByRole('combobox', { name: 'クラスタ数' })
    unmount()

    renderPanel({ embedder, labeler: createFakeLabeler(), cache })
    // 前提: 2 回目はボタンを押さなくても、キャッシュから結果を表示します
    expect(await screen.findByRole('combobox', { name: 'クラスタ数' })).toBeInTheDocument()
    expect(embedder.embed).toHaveBeenCalledTimes(1)
  })

  it('分析中は、モデルのダウンロードの進捗を表示する', async () => {
    const embedder = createFakeEmbedder()
    // 前提: ダウンロードの途中で止まり、埋め込みが終わらない状態にします
    embedder.embed.mockImplementation((_texts: string[], onProgress: (progress: EmbeddingProgress) => void) => {
      onProgress({ phase: 'download', loadedBytes: 22_000_000, totalBytes: 44_000_000 })
      return new Promise(() => {})
    })
    const user = userEvent.setup()
    renderPanel({ embedder, labeler: createFakeLabeler(), cache: createMemoryStore() })
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    expect(await screen.findByRole('progressbar', { name: 'モデルのダウンロード' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText(/22\.0 \/ 44\.0 MB/)).toBeInTheDocument()
  })

  it('埋め込みに失敗した場合は、理由を表示する', async () => {
    const embedder = createFakeEmbedder()
    embedder.embed.mockRejectedValue(new Error('モデルを取得できません'))
    const user = userEvent.setup()
    renderPanel({ embedder, labeler: createFakeLabeler(), cache: createMemoryStore() })
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('モデルを取得できません')
  })

  it('結果をキャッシュに保存できなくても結果を表示し、保存できなかったことを示す', async () => {
    const cache = createMemoryStore()
    cache.set = vi.fn(async () => {
      throw new Error('容量が足りません')
    })
    const user = userEvent.setup()
    renderPanel({ embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache })
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    expect(await screen.findByRole('combobox', { name: 'クラスタ数' })).toBeInTheDocument()
    expect(screen.getByText(/キャッシュに保存できませんでした.*容量が足りません/)).toBeInTheDocument()
  })

  it('意見 CSV の内容が変わると、前の内容の分析結果を使わずに分析し直せる状態に戻る', async () => {
    const deps = { embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache: createMemoryStore() }
    const comments = [
      { id: 'c1', body: '給食を無償にしてほしい', attributes: {} },
      { id: 'c2', body: '公園を増やしたい', attributes: {} },
    ]
    const user = userEvent.setup()
    const { rerender } = render(
      <OpinionAnalysisContext.Provider value={deps}>
        <OpinionAnalysisPanel path={path} csvText="内容 A" comments={comments} />
      </OpinionAnalysisContext.Provider>,
    )
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    await screen.findByRole('combobox', { name: 'クラスタ数' })

    // 前提: LLM が意見 CSV を書き換え、意見が 1 件増えました
    rerender(
      <OpinionAnalysisContext.Provider value={deps}>
        <OpinionAnalysisPanel path={path} csvText="内容 B" comments={[...comments, { id: 'c3', body: '図書館を広くしてほしい', attributes: {} }]} />
      </OpinionAnalysisContext.Provider>,
    )
    expect(await screen.findByRole('button', { name: '意見を分析' })).toBeInTheDocument()
  })

  it('結果を JSON で書き出せる', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:結果')
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPanel({ embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache: createMemoryStore() })
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    await user.click(await screen.findByRole('button', { name: 'JSON を書き出す' }))

    expect(click).toHaveBeenCalledTimes(1)
    const exported = parseClusterJson(await createObjectURL.mock.calls[0][0].text())
    expect(exported.modelId).toBe('テスト用の埋め込みモデル')
    expect(exported.source).toBe(path)
    expect(exported.result.comments).toHaveLength(5)
  })
})

describe('意見クラスタのラベル付け', () => {
  /** 意見を分析し、クラスタ数を 2 にするまでの操作です。 */
  async function analyzeIntoTwoClusters(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: '意見を分析' }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'クラスタ数' }), '2')
  }

  it('LLM が生成したラベルと説明を、LLM の要約であることと根拠にした意見の comment-id とともに表示する', async () => {
    const user = userEvent.setup()
    renderPanel({ embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache: createMemoryStore() })
    await analyzeIntoTwoClusters(user)
    await user.click(screen.getByRole('button', { name: 'ラベルを生成' }))

    await user.click(await screen.findByRole('button', { name: /給食の改善（3 件）/ }))
    expect(screen.getByText('給食の費用と内容の改善を求める意見です。')).toBeInTheDocument()
    expect(screen.getByText('LLM が生成した要約')).toBeInTheDocument()
    const basis = screen.getByRole('list', { name: 'クラスタ 1 のラベルの根拠にした意見' })
    expect(within(basis).getByText('c1')).toBeInTheDocument()
    expect(within(basis).getByText('給食を無償にしてほしい')).toBeInTheDocument()
  })

  it('WebGPU が使えない環境では、ラベル付けを実行できない理由を表示し、クラスタはラベル無しで使える', async () => {
    const user = userEvent.setup()
    const labeler = createFakeLabeler({ ok: false, reason: 'このブラウザは WebGPU に対応していません。' })
    renderPanel({ embedder: createFakeEmbedder(), labeler, cache: createMemoryStore() })
    await analyzeIntoTwoClusters(user)
    expect(await screen.findByText('このブラウザは WebGPU に対応していません。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ラベルを生成' })).toBeNull()
    expect(screen.getByRole('button', { name: /クラスタ 1（3 件）/ })).toBeInTheDocument()
  })

  it('LLM の出力が想定の形式でないクラスタは、空のラベルにせず失敗として表示する', async () => {
    const user = userEvent.setup()
    const labeler = createFakeLabeler()
    labeler.generate.mockImplementation(async (messages: ChatMessage[]) =>
      messages.some((message) => message.content.includes('給食')) ? '{"label": "給食の改善", "description": "給食の意見です。"}' : '公園についての意見です',
    )
    renderPanel({ embedder: createFakeEmbedder(), labeler, cache: createMemoryStore() })
    await analyzeIntoTwoClusters(user)
    await user.click(screen.getByRole('button', { name: 'ラベルを生成' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/クラスタ 2 のラベルを生成できませんでした.*JSON/)
    expect(screen.getByRole('button', { name: /給食の改善（3 件）/ })).toBeInTheDocument()
  })

  it('生成したラベルはキャッシュし、同じ入力とクラスタ数では LLM を呼ばずに表示する', async () => {
    const deps = { embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache: createMemoryStore() }
    const user = userEvent.setup()
    const { unmount } = renderPanel(deps)
    await analyzeIntoTwoClusters(user)
    await user.click(screen.getByRole('button', { name: 'ラベルを生成' }))
    await screen.findByRole('button', { name: /給食の改善/ })
    unmount()

    renderPanel(deps)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'クラスタ数' }), '2')
    expect(await screen.findByRole('button', { name: /給食の改善/ })).toBeInTheDocument()
    // 前提: 1 回目の生成でクラスタ 2 つ分の 2 回だけ呼ばれています
    expect(deps.labeler.generate).toHaveBeenCalledTimes(2)
  })

  it('書き出す JSON に、生成したラベルを含める', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:結果')
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPanel({ embedder: createFakeEmbedder(), labeler: createFakeLabeler(), cache: createMemoryStore() })
    await analyzeIntoTwoClusters(user)
    await user.click(screen.getByRole('button', { name: 'ラベルを生成' }))
    await screen.findByRole('button', { name: /給食の改善/ })
    await user.click(screen.getByRole('button', { name: 'JSON を書き出す' }))

    const exported = parseClusterJson(await createObjectURL.mock.calls[0][0].text())
    expect(exported.labelModelId).toBe('テスト用の LLM')
    expect(exported.labels.map((label) => label.label).sort()).toEqual(['公園の整備', '給食の改善'])
  })
})
