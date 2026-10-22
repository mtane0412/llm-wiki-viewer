import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createVaultRegistry, type KeyValueStore } from './source/vaultRegistry'
import { createFakeFileSystem, type FakeTree } from './test/fakeFileSystem'

vi.mock('react-force-graph-2d', () => ({
  default: (props: { graphData: { nodes: unknown[]; links: unknown[] } }) => (
    <div data-testid="force-graph">{`ノード ${props.graphData.nodes.length} 件、リンク ${props.graphData.links.length} 本`}</div>
  ),
}))

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

/** コーディングエージェントを調べる Wiki のテストデータです。 */
const agentWiki: FakeTree = {
  'CLAUDE.md': '# スキーマ',
  wiki: {
    'index.md': '---\ntitle: Index\n---\n# Index\n\n- [[concepts/tool-use]] — ツール使用\n- [[存在しないページ]]',
    concepts: {
      'tool-use.md': '---\ntitle: Tool use\ntype: concept\ntags: [tool]\nsources: ["[[sources/codex]]"]\n---\n# Tool use\n\nシェルと編集のツール。',
      '孤立.md': '---\ntitle: 孤立した概念\nsources: ["[[sources/codex]]"]\n---\n誰からも参照されない。',
    },
    sources: { 'codex.md': '---\ntitle: Codex リポジトリ\ntype: source\n---\n要約。原文は [[raw/notes/codex-memo|Codex の生メモ]]。' },
  },
  raw: { notes: { 'codex-memo.md': '# Codex の生メモ\n\n原文の本文。' } },
}

/** 料理を調べる Wiki のテストデータです。 */
const cookingWiki: FakeTree = {
  wiki: { 'index.md': '# 料理の目次\n\n[[出汁]]', '出汁.md': '---\ntitle: 出汁\nsources: ["[[a]]"]\n---\nシェルではなく昆布と鰹節。' },
}

describe('App', () => {
  beforeEach(() => {
    window.location.hash = ''
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** テスト用の依存を組み立ててアプリを描画します。 */
  function renderApp(options: { pick?: FileSystemDirectoryHandle[]; store?: KeyValueStore; supportsPicker?: boolean; pollIntervalMs?: number } = {}) {
    const queue = [...(options.pick ?? [])]
    const pickDirectory = vi.fn(async () => {
      const next = queue.shift()
      if (!next) throw new DOMException('キャンセルされました', 'AbortError')
      return next
    })
    const registry = createVaultRegistry(options.store ?? createMemoryStore())
    render(
      <App
        deps={{
          registry,
          pickDirectory: options.supportsPicker === false ? null : pickDirectory,
          pollIntervalMs: options.pollIntervalMs ?? 60_000,
        }}
      />,
    )
    return { user: userEvent.setup(), pickDirectory, registry }
  }

  it('登録済みの Wiki が無ければスタート画面を表示する', async () => {
    renderApp()
    expect(await screen.findByRole('button', { name: 'Wiki フォルダを開く' })).toBeInTheDocument()
  })

  it('フォルダを開くと index.md を表示する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Index' })).toBeInTheDocument()
    expect(window.location.hash).toMatch(/\/page\/wiki\/index\.md$/)
  })

  it('wikilink をたどると、ページのメタ情報とバックリンクを表示する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    const main = await screen.findByRole('main')
    await user.click(await within(main).findByRole('link', { name: 'Tool use' }))

    expect(await within(main).findByText('シェルと編集のツール。')).toBeInTheDocument()
    expect(within(main).getByText('concept')).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Codex リポジトリ' })).toBeInTheDocument()
    const backlinks = within(main).getByRole('region', { name: 'バックリンク' })
    expect(within(backlinks).getByRole('link', { name: 'Index' })).toBeInTheDocument()
  })

  it('raw/ の元資料は、開いたときに内容を読み込んで表示する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    const main = await screen.findByRole('main')
    await user.click(await within(main).findByRole('link', { name: 'Tool use' }))
    await user.click(await within(main).findByRole('link', { name: 'Codex リポジトリ' }))
    await user.click(await within(main).findByRole('link', { name: 'Codex の生メモ' }))
    expect(await within(main).findByText('原文の本文。')).toBeInTheDocument()
    expect(within(main).getByText('元資料')).toBeInTheDocument()
  })

  it('lint 画面に壊れたリンクと孤立ページを表示する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await user.click(await screen.findByRole('link', { name: /Lint/ }))

    const broken = await screen.findByRole('region', { name: /壊れたリンク/ })
    expect(within(broken).getByText('存在しないページ')).toBeInTheDocument()
    const orphans = screen.getByRole('region', { name: /孤立ページ/ })
    expect(within(orphans).getByRole('link', { name: '孤立した概念' })).toBeInTheDocument()
  })

  it('グラフ画面に Wiki のページをノードとして渡す', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await user.click(await screen.findByRole('link', { name: 'グラフ' }))
    expect(await screen.findByTestId('force-graph')).toHaveTextContent('ノード 3 件、リンク 2 本')
  })

  it('検索結果をクリックするとそのページへ移動する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await user.type(await screen.findByRole('searchbox', { name: '検索' }), 'シェル')
    const results = await screen.findByRole('region', { name: '検索結果' })
    await user.click(within(results).getByRole('link', { name: /Tool use/ }))
    expect(await screen.findByText('シェルと編集のツール。')).toBeInTheDocument()
  })

  it('複数の Wiki を切り替え、すべての Wiki を横断して検索できる', async () => {
    const { user } = renderApp({
      pick: [createFakeFileSystem('agent-wiki', agentWiki).root, createFakeFileSystem('cooking-wiki', cookingWiki).root],
    })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })
    await user.click(screen.getByRole('button', { name: 'フォルダを追加' }))
    expect(await screen.findByRole('heading', { level: 1, name: '料理の目次' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: '表示する Wiki' }), 'agent-wiki')
    expect(await screen.findByRole('heading', { level: 1, name: 'Index' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'すべての Wiki を検索' }))
    await user.type(screen.getByRole('searchbox', { name: '検索' }), 'シェル')
    const results = await screen.findByRole('region', { name: '検索結果' })
    expect(within(results).getByRole('link', { name: /Tool use/ })).toBeInTheDocument()
    expect(within(results).getByRole('link', { name: /出汁/ })).toBeInTheDocument()
  })

  it('読み取り許可が切れた登録済みの Wiki は、再接続ボタンで許可を求めて開く', async () => {
    const store = createMemoryStore()
    const fs = createFakeFileSystem('agent-wiki', agentWiki, { permission: 'prompt' })
    await createVaultRegistry(store).add(fs.root)

    const { user } = renderApp({ store })
    await user.click(await screen.findByRole('button', { name: 'agent-wiki に再接続' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Index' })).toBeInTheDocument()
  })

  it('許可が残っている登録済みの Wiki は起動時に自動で開く', async () => {
    const store = createMemoryStore()
    await createVaultRegistry(store).add(createFakeFileSystem('agent-wiki', agentWiki).root)
    renderApp({ store })
    expect(await screen.findByRole('heading', { level: 1, name: 'Index' })).toBeInTheDocument()
  })

  it('LLM がファイルを更新すると、表示中のページを自動で読み直す', async () => {
    const fs = createFakeFileSystem('agent-wiki', agentWiki)
    const { user } = renderApp({ pick: [fs.root], pollIntervalMs: 50 })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })

    await act(async () => {
      fs.writeFile('wiki/index.md', '# 更新後の目次')
    })
    expect(await screen.findByRole('heading', { level: 1, name: '更新後の目次' }, { timeout: 2000 })).toBeInTheDocument()
  })

  it('File System Access API が無いブラウザでは、フォルダ選択の入力欄から読み込む', async () => {
    const { user } = renderApp({ supportsPicker: false })
    const input = await screen.findByLabelText('Wiki フォルダを選択（読み込み専用）')
    const file = new File(['# 目次だけの Wiki'], 'index.md')
    Object.defineProperty(file, 'webkitRelativePath', { value: 'simple-wiki/wiki/index.md' })
    await user.upload(input, [file])
    expect(await screen.findByRole('heading', { level: 1, name: '目次だけの Wiki' })).toBeInTheDocument()
  })
})
