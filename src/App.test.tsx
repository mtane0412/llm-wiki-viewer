import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createSeenStore } from './source/seenStore'
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
  raw: { notes: { 'codex-memo.md': '---\ntype: memo\ntags: [生メモ]\n---\n# Codex の生メモ\n\n原文の本文。' } },
}

/** 料理を調べる Wiki のテストデータです。 */
const cookingWiki: FakeTree = {
  wiki: { 'index.md': '# 料理の目次\n\n[[出汁]]', '出汁.md': '---\ntitle: 出汁\nsources: ["[[a]]"]\n---\nシェルではなく昆布と鰹節。' },
}

/** 給食派と公園派に分かれ、全員が「通学路を安全にしてほしい」に賛成する投票を持つ Wiki です。 */
const surveyWiki: FakeTree = {
  wiki: { 'index.md': '# 住民アンケート\n\n[[raw/survey/votes.csv|投票の集計]]' },
  raw: {
    survey: {
      'comments.csv': 'comment-id,comment-body\nc1,給食を無償にしてほしい\nc2,公園を増やしたい\nc3,通学路を安全にしてほしい',
      'votes.csv': 'participant,c1,c2,c3\np1,1,-1,1\np2,1,-1,1\np3,-1,1,1\np4,-1,1,1',
    },
  },
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
    const store = options.store ?? createMemoryStore()
    const registry = createVaultRegistry(store)
    const { unmount } = render(
      <App
        deps={{
          registry,
          seenStore: createSeenStore(store),
          pickDirectory: options.supportsPicker === false ? null : pickDirectory,
          pollIntervalMs: options.pollIntervalMs ?? 60_000,
        }}
      />,
    )
    return { user: userEvent.setup(), pickDirectory, registry, unmount }
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
    expect(within(main).getByText('memo')).toBeInTheDocument()
    expect(within(main).getByText('#生メモ')).toBeInTheDocument()
  })

  it('raw/ の投票 CSV へのリンクを開くと、意見グループと合意点を表示する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('survey-wiki', surveyWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    const main = await screen.findByRole('main')
    await user.click(await within(main).findByRole('link', { name: '投票の集計' }))
    const consensus = await within(main).findByRole('region', { name: /合意点/ })
    expect(within(consensus).getByText('通学路を安全にしてほしい')).toBeInTheDocument()
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

  it('リポジトリ直下の CLAUDE.md をサイドバーからスキーマとして表示する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await user.click(await screen.findByRole('link', { name: 'スキーマ（CLAUDE.md）' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'スキーマ' })).toBeInTheDocument()
    expect(window.location.hash).toMatch(/\/schema$/)
  })

  it('CLAUDE.md が無い Wiki では、スキーマへのリンクを表示しない', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('cooking-wiki', cookingWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: '料理の目次' })
    expect(screen.queryByRole('link', { name: 'スキーマ（CLAUDE.md）' })).toBeNull()
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

  it('自動の再読み込みが一時的に失敗しても監視を続け、次の周期で反映する', async () => {
    const fs = createFakeFileSystem('agent-wiki', agentWiki)
    const { user } = renderApp({ pick: [fs.root], pollIntervalMs: 50 })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })

    await act(async () => {
      fs.writeFile('wiki/index.md', '# 失敗後に反映される目次')
      fs.failNextRead('wiki/index.md')
    })
    expect(await screen.findByRole('heading', { level: 1, name: '失敗後に反映される目次' }, { timeout: 2000 })).toBeInTheDocument()
  })

  it('変更の確認が一時的に失敗したときの警告は、次の周期で成功すると消える', async () => {
    const fs = createFakeFileSystem('agent-wiki', agentWiki)
    const { user } = renderApp({ pick: [fs.root], pollIntervalMs: 50 })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })

    await act(async () => {
      fs.failNextRead('wiki/index.md')
    })
    expect(await screen.findByText(/再読み込みに失敗しました/, {}, { timeout: 2000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/再読み込みに失敗しました/)).toBeNull(), { timeout: 2000 })
  })

  it('前回の閲覧以降に LLM が更新・追加したページを「最近」の画面に示し、開くと既読にする', async () => {
    const fs = createFakeFileSystem('agent-wiki', agentWiki)
    const { user } = renderApp({ pick: [fs.root], pollIntervalMs: 50 })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })

    // 前提: 初めて開いた時点の内容を既読の基準にするため、最初は変わったページがありません
    await user.click(screen.getByRole('link', { name: /最近/ }))
    const changed = await screen.findByRole('region', { name: '前回の閲覧以降に変わったページ' })
    expect(within(changed).getByText('変わったページはありません。')).toBeInTheDocument()

    await act(async () => {
      fs.writeFile('wiki/concepts/tool-use.md', '---\ntitle: Tool use\n---\n# Tool use\n\n承認の説明を追記した。')
      fs.writeFile('wiki/concepts/agent.md', '---\ntitle: エージェント\n---\n新しいページ。')
    })
    const toolUse = await within(changed).findByRole('link', { name: 'Tool use' }, { timeout: 2000 })
    expect(toolUse.closest('li')).toHaveTextContent('更新あり')
    expect(within(changed).getByRole('link', { name: 'エージェント' }).closest('li')).toHaveTextContent('新規')

    // 更新されたページを開くと既読になり、一覧から消えます
    await user.click(toolUse)
    await screen.findByText('承認の説明を追記した。')
    await user.click(screen.getByRole('link', { name: /最近/ }))
    const changedAfterRead = await screen.findByRole('region', { name: '前回の閲覧以降に変わったページ' })
    expect(within(changedAfterRead).queryByRole('link', { name: 'Tool use' })).toBeNull()
    expect(within(changedAfterRead).getByRole('link', { name: 'エージェント' })).toBeInTheDocument()
  })

  it('既読の記録は Wiki ごとに保存され、次回の起動時にも引き継がれる', async () => {
    const store = createMemoryStore()
    const fs = createFakeFileSystem('agent-wiki', agentWiki)
    await createVaultRegistry(store).add(fs.root)
    const first = renderApp({ store })
    await screen.findByRole('heading', { level: 1, name: 'Index' })
    first.unmount()

    // 前提: アプリを閉じている間に LLM がページを更新しました
    fs.writeFile('wiki/concepts/tool-use.md', '---\ntitle: Tool use\n---\n閉じている間の更新。')
    const { user } = renderApp({ store })
    await screen.findByRole('heading', { level: 1, name: 'Index' })
    await user.click(screen.getByRole('link', { name: /最近/ }))
    const changed = await screen.findByRole('region', { name: '前回の閲覧以降に変わったページ' })
    expect(await within(changed).findByRole('link', { name: 'Tool use' })).toBeInTheDocument()
  })

  it('File System Access API が無いブラウザでは、フォルダ選択の入力欄から読み込む', async () => {
    const { user } = renderApp({ supportsPicker: false })
    const input = await screen.findByLabelText('Wiki フォルダを選択（読み込み専用）')
    const file = new File(['# 目次だけの Wiki'], 'index.md')
    Object.defineProperty(file, 'webkitRelativePath', { value: 'simple-wiki/wiki/index.md' })
    await user.upload(input, [file])
    expect(await screen.findByRole('heading', { level: 1, name: '目次だけの Wiki' })).toBeInTheDocument()
  })

  it('タブのタイトルに、表示中のページと Wiki の名前を出す', async () => {
    // 前提: スタート画面ではアプリ名だけ。Wiki を開くとホームページ（Index）を表示する
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })
    await waitFor(() => expect(document.title).toBe('Index - agent-wiki - LLM Wiki Viewer'))

    // 検証: 別の画面へ移るとタイトルも変わる
    await user.click(screen.getByRole('link', { name: /Lint/ }))
    await waitFor(() => expect(document.title).toBe('Lint - agent-wiki - LLM Wiki Viewer'))
  })

  it('検索結果の URL を開くと、メインの領域に検索結果を表示する', async () => {
    const { user } = renderApp({ pick: [createFakeFileSystem('agent-wiki', agentWiki).root] })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })
    // 前提: Wiki の id は開くたびに変わるため、現在の URL から取り出す
    const vaultId = window.location.hash.split('/')[1]

    act(() => {
      window.location.hash = `#/${vaultId}/search?q=${encodeURIComponent('シェル')}`
    })

    const main = screen.getByRole('main')
    expect(await within(main).findByRole('heading', { level: 1, name: '「シェル」の検索結果' })).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Tool use' })).toBeInTheDocument()
  })

  it('読み取り許可が切れた Wiki の検索結果の URL では、検索結果の代わりに再接続ボタンを表示する', async () => {
    // 前提: 登録済みだが読み取り許可が切れている Wiki の検索結果の URL を直接開く
    const store = createMemoryStore()
    const fs = createFakeFileSystem('agent-wiki', agentWiki, { permission: 'prompt' })
    const registered = await createVaultRegistry(store).add(fs.root)
    window.location.hash = `#/${registered.id}/search?q=${encodeURIComponent('シェル')}`

    const { user } = renderApp({ store })
    await user.click(await screen.findByRole('button', { name: 'agent-wiki に再接続' }))

    // 検証: 再接続すると、検索結果を表示する
    const main = screen.getByRole('main')
    expect(await within(main).findByRole('link', { name: 'Tool use' })).toBeInTheDocument()
  })

  it('すべての Wiki を対象にした検索結果の URL では、ほかの Wiki のページも表示する', async () => {
    const { user } = renderApp({
      pick: [createFakeFileSystem('agent-wiki', agentWiki).root, createFakeFileSystem('cooking-wiki', cookingWiki).root],
    })
    await user.click(await screen.findByRole('button', { name: 'Wiki フォルダを開く' }))
    await screen.findByRole('heading', { level: 1, name: 'Index' })
    await user.click(screen.getByRole('button', { name: 'フォルダを追加' }))
    await screen.findByRole('heading', { level: 1, name: '料理の目次' })
    const vaultId = window.location.hash.split('/')[1]

    act(() => {
      window.location.hash = `#/${vaultId}/search?q=${encodeURIComponent('シェル')}&all=1`
    })

    const main = screen.getByRole('main')
    expect(await within(main).findByRole('link', { name: '出汁（cooking-wiki）' })).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Tool use（agent-wiki）' })).toBeInTheDocument()
  })
})
