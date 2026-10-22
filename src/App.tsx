/**
 * LLM Wiki Viewer のルートコンポーネントです。
 *
 * 画面構成:
 * - 左: Wiki の切り替え、検索、表示の切り替え（ページ / タグ / 最近 / 未解決 / Lint / グラフ）、ページ一覧
 * - 右: 選んだ画面（ページ・タグと type の一覧・絞り込んだページ一覧・最近の更新・未解決の矛盾と問い・lint の指摘・グラフ・スキーマ・検索結果）
 * 検索結果の画面は URL（`#/{vaultId}/search?q=...`）で開きます。サイドバーの検索欄は、表示中の画面を変えずに結果を一覧します。
 * タブのタイトルには、表示中の画面と Wiki の名前を出します。
 * リポジトリ直下に CLAUDE.md（Wiki のスキーマ）がある場合は、サイドバーからスキーマの画面を開けます。
 * Wiki を 1 つも開いていない場合は、スタート画面だけを表示します。
 */
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useHashRoute } from './app/useHashRoute'
import { useSeenPages, type SeenPagesState } from './app/useSeenPages'
import { useVaults, type AppDeps, type Vault } from './app/useVaults'
import { CalloutsView } from './components/CalloutsView'
import { DeferredPageView } from './components/DeferredPageView'
import { FileTree } from './components/FileTree'
import { FolderInput } from './components/FolderInput'
import { LintView } from './components/LintView'
import { PageView } from './components/PageView'
import { RecentView } from './components/RecentView'
import { SchemaView } from './components/SchemaView'
import { SearchResults, type VaultSearchResult } from './components/SearchResults'
import { StartView } from './components/StartView'
import { PagesByTagView, PagesByTypeView, TaxonomyView } from './components/TaxonomyView'
import { documentTitle } from './lib/documentTitle'
import { formatRoute, type Route } from './lib/route'
import { searchPages } from './lib/search'
import type { WikiIndex } from './lib/wikiIndex'
import './App.css'

/** グラフ画面は描画ライブラリが大きいため、開いたときに読み込みます。 */
const GraphView = lazy(() => import('./components/GraphView'))

/** App の引数です。 */
export interface AppProps {
  deps: AppDeps
}

/** 画面の状態から Wiki の id を取り出します。 */
function vaultIdOf(route: Route): string | null {
  return route.view === 'start' ? null : route.vaultId
}

/** 複数の Wiki のページを検索し、Wiki の名前つきの結果を返します。検索語が空白だけなら空の配列です。 */
function searchVaults(vaults: Vault[], query: string): VaultSearchResult[] {
  if (!query.trim()) return []
  return vaults.flatMap((item) =>
    item.index ? searchPages(item.index.pages, query).map((result) => ({ ...result, vaultId: item.id, vaultName: item.name })) : [],
  )
}

/** LLM Wiki Viewer の画面全体です。 */
export default function App({ deps }: AppProps) {
  const api = useVaults(deps)
  const [route, navigate] = useHashRoute()
  const [query, setQuery] = useState('')
  const [searchAll, setSearchAll] = useState(false)
  const deferredQuery = useDeferredValue(query)

  const routeVaultId = vaultIdOf(route)
  const vault: Vault | undefined = api.vaults.find((item) => item.id === routeVaultId)
  const supportsPicker = deps.pickDirectory !== null
  // フックは早期の return より前で呼ぶ必要があるため、Wiki が未読み込みでもここで呼びます
  const seenPages = useSeenPages(
    deps.seenStore,
    vault?.status === 'ready' ? vault.id : null,
    vault?.status === 'ready' ? vault.index : null,
    route.view === 'page' ? route.path : null,
  )

  // Wiki のホームを開いたら、ホームページ（index.md など）の URL に置き換えます
  useEffect(() => {
    if (route.view === 'home' && vault?.status === 'ready' && vault.index?.homePath) {
      navigate(formatRoute({ view: 'page', vaultId: vault.id, path: vault.index.homePath, heading: undefined }), { replace: true })
    }
  }, [route, vault, navigate])

  // スタート画面のときに開いている Wiki があれば、最初の Wiki を表示します
  useEffect(() => {
    if (route.view !== 'start') return
    const firstReady = api.vaults.find((item) => item.status === 'ready')
    if (firstReady) navigate(formatRoute({ view: 'home', vaultId: firstReady.id }), { replace: true })
  }, [route, api.vaults, navigate])

  useEffect(() => {
    document.title = documentTitle(route, vault)
  }, [route, vault])

  const results = useMemo(() => searchVaults(searchAll ? api.vaults : vault ? [vault] : [], deferredQuery), [deferredQuery, searchAll, api.vaults, vault])
  // 検索結果の画面（URL で指定）の結果です。サイドバーの検索欄とは独立しています
  const routeResults = useMemo(() => {
    if (route.view !== 'search') return []
    return searchVaults(route.all ? api.vaults : vault ? [vault] : [], route.query)
  }, [route, api.vaults, vault])

  const openDirectory = async () => {
    const id = await api.openDirectory()
    if (id) navigate(formatRoute({ view: 'home', vaultId: id }))
  }
  const openFiles = async (files: File[]) => {
    const id = await api.openFiles(files)
    if (id) navigate(formatRoute({ view: 'home', vaultId: id }))
  }

  const errorBanner = api.error && (
    <p role="alert" className="error-banner">
      {api.error}
    </p>
  )

  if (!api.initialized) {
    return <p className="loading-screen">読み込み中…</p>
  }

  if (!vault) {
    return (
      <main className="start-layout">
        {errorBanner}
        {route.view !== 'start' && <p className="error-banner">指定された Wiki は開かれていません。もう一度フォルダを開いてください。</p>}
        <StartView
          vaults={api.vaults}
          supportsPicker={supportsPicker}
          onOpenDirectory={openDirectory}
          onOpenFiles={openFiles}
          onReconnect={(id) => void api.reconnect(id)}
          onSelect={(id) => navigate(formatRoute({ view: 'home', vaultId: id }))}
        />
      </main>
    )
  }

  const index = vault.index
  const currentPath = route.view === 'page' ? route.path : null
  const issueCount = index?.issues.length ?? 0

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="app-name" href={formatRoute({ view: 'home', vaultId: vault.id })}>
            LLM Wiki Viewer
          </a>
          <div className="vault-switcher">
            <select
              aria-label="表示する Wiki"
              value={vault.id}
              onChange={(event) => navigate(formatRoute({ view: 'home', vaultId: event.currentTarget.value }))}
            >
              {api.vaults.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="vault-actions">
              {supportsPicker ? (
                <button type="button" className="button" onClick={openDirectory}>
                  フォルダを追加
                </button>
              ) : (
                <FolderInput label="フォルダを追加（読み込み専用）" onSelect={openFiles} />
              )}
              <button type="button" className="button button-quiet" onClick={() => void api.remove(vault.id).then(() => navigate('#/'))}>
                登録を解除
              </button>
            </div>
            {index?.schema && (
              <a className="schema-link small" href={formatRoute({ view: 'schema', vaultId: vault.id, heading: undefined })} aria-current={route.view === 'schema' ? 'page' : undefined}>
                スキーマ（CLAUDE.md）
              </a>
            )}
            {!vault.watchable && <p className="muted small">この Wiki は読み込んだ時点の内容です。変更は自動で反映されません。</p>}
          </div>
        </div>

        <nav className="view-tabs" aria-label="表示の切り替え">
          <a href={formatRoute({ view: 'home', vaultId: vault.id })} aria-current={route.view === 'page' ? 'page' : undefined}>
            ページ
          </a>
          <a
            href={formatRoute({ view: 'tags', vaultId: vault.id })}
            aria-current={route.view === 'tags' || route.view === 'tag' || route.view === 'type' ? 'page' : undefined}
          >
            タグ
          </a>
          <a href={formatRoute({ view: 'recent', vaultId: vault.id })} aria-current={route.view === 'recent' ? 'page' : undefined}>
            最近 {seenPages.status === 'ready' && seenPages.changes.size > 0 && <span className="count">{seenPages.changes.size}</span>}
          </a>
          <a href={formatRoute({ view: 'callouts', vaultId: vault.id })} aria-current={route.view === 'callouts' ? 'page' : undefined}>
            未解決
          </a>
          <a href={formatRoute({ view: 'lint', vaultId: vault.id })} aria-current={route.view === 'lint' ? 'page' : undefined}>
            Lint <span className="count">{issueCount}</span>
          </a>
          <a href={formatRoute({ view: 'graph', vaultId: vault.id })} aria-current={route.view === 'graph' ? 'page' : undefined}>
            グラフ
          </a>
        </nav>

        <div className="search">
          <input type="search" aria-label="検索" placeholder="タイトル・本文を検索" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
          {api.vaults.length > 1 && (
            <label className="search-all">
              <input type="checkbox" checked={searchAll} onChange={(event) => setSearchAll(event.currentTarget.checked)} />
              すべての Wiki を検索
            </label>
          )}
        </div>

        <div className="sidebar-body">
          {deferredQuery.trim() ? (
            <SearchResults results={results} showVaultName={searchAll} />
          ) : (
            index && <FileTree index={index} vaultId={vault.id} currentPath={currentPath} />
          )}
        </div>
      </aside>

      <main className="content">
        {errorBanner}
        <MainContent
          vault={vault}
          route={route}
          navigate={navigate}
          seenPages={seenPages}
          searchResults={routeResults}
          onReconnect={() => void api.reconnect(vault.id)}
        />
      </main>
    </div>
  )
}

/** SearchView の引数です。 */
interface SearchViewProps {
  query: string
  results: VaultSearchResult[]
  /** Wiki の名前を表示するかどうか（すべての Wiki が対象のとき true）です。 */
  showVaultName: boolean
}

/** URL で指定した検索語の検索結果を、メインの領域に表示します。 */
function SearchView({ query, results, showVaultName }: SearchViewProps) {
  return (
    <div className="search-view">
      <h1>{query.trim() ? `「${query}」の検索結果` : '検索結果'}</h1>
      <SearchResults results={results} showVaultName={showVaultName} />
    </div>
  )
}

/** MainContent の引数です。 */
interface MainContentProps {
  vault: Vault
  route: Route
  navigate: (hash: string) => void
  seenPages: SeenPagesState
  /** 検索結果の画面（URL で指定）に表示する結果です。 */
  searchResults: VaultSearchResult[]
  onReconnect: () => void
}

/**
 * 右側の主要な表示領域です。Wiki の状態と画面の種類に応じて表示を切り替えます。
 * 検索結果の画面も、Wiki の再接続や読み込みエラーの表示を優先します。
 */
function MainContent({ vault, route, navigate, seenPages, searchResults, onReconnect }: MainContentProps) {
  if (vault.status === 'needs-permission') {
    return (
      <div className="notice">
        <p>{`「${vault.name}」を読むには、フォルダの読み取りを許可し直す必要があります。`}</p>
        <button type="button" className="button button-primary" onClick={onReconnect}>
          {`${vault.name} に再接続`}
        </button>
      </div>
    )
  }
  if (vault.status === 'error') {
    return (
      <p role="alert" className="error-banner">
        {`「${vault.name}」を読み込めませんでした: ${vault.error}`}
      </p>
    )
  }
  if (vault.status === 'loading' || !vault.index || !vault.readText || !vault.readBlob) {
    return <p className="muted">読み込み中…</p>
  }

  const index = vault.index
  const reloadWarning = vault.error && (
    <p role="alert" className="error-banner">
      {vault.error}
    </p>
  )
  if (route.view === 'search') {
    return (
      <>
        {reloadWarning}
        <SearchView query={route.query} results={searchResults} showVaultName={route.all} />
      </>
    )
  }
  return (
    <>
      {reloadWarning}
      <ViewContent
        vault={vault}
        index={index}
        readText={vault.readText}
        readBlob={vault.readBlob}
        route={route}
        navigate={navigate}
        seenPages={seenPages}
      />
    </>
  )
}

/** ViewContent の引数です。 */
interface ViewContentProps {
  vault: Vault
  index: WikiIndex
  readText: (path: string) => Promise<string>
  readBlob: (path: string) => Promise<Blob>
  route: Route
  navigate: (hash: string) => void
  seenPages: SeenPagesState
}

/** 画面の種類（ページ・タグ・未解決・lint・グラフ）に応じた表示です。 */
function ViewContent({ vault, index, readText, readBlob, route, navigate, seenPages }: ViewContentProps) {
  switch (route.view) {
    case 'recent':
      return <RecentView index={index} vaultId={vault.id} seenPages={seenPages} />
    case 'callouts':
      return <CalloutsView index={index} vaultId={vault.id} readBlob={readBlob} />
    case 'schema':
      return index.schema ? (
        <SchemaView schema={index.schema} index={index} vaultId={vault.id} heading={route.heading} readBlob={readBlob} />
      ) : (
        <p className="notice">この Wiki にはスキーマ（リポジトリ直下の CLAUDE.md）がありません。</p>
      )
    case 'tags':
      return <TaxonomyView index={index} vaultId={vault.id} />
    case 'tag':
      return <PagesByTagView index={index} vaultId={vault.id} tag={route.tag} />
    case 'type':
      return <PagesByTypeView index={index} vaultId={vault.id} type={route.type} />
    case 'lint':
      return <LintView index={index} vaultId={vault.id} />
    case 'graph':
      return (
        <Suspense fallback={<p className="muted">グラフを準備しています…</p>}>
          <GraphView index={index} vaultId={vault.id} onNavigate={navigate} />
        </Suspense>
      )
    case 'page': {
      const page = index.pageByPath.get(route.path)
      if (!page) {
        return (
          <div className="notice">
            <p>{`ページが見つかりません: ${route.path}`}</p>
            <a href={formatRoute({ view: 'home', vaultId: vault.id })}>ホームへ戻る</a>
          </div>
        )
      }
      if (!page.loaded) {
        return <DeferredPageView page={page} index={index} vaultId={vault.id} heading={route.heading} readText={readText} readBlob={readBlob} />
      }
      return <PageView page={page} index={index} vaultId={vault.id} heading={route.heading} readBlob={readBlob} />
    }
    default:
      return index.homePath ? <p className="muted">読み込み中…</p> : <p className="notice">この Wiki には Markdown のページがありません。</p>
  }
}
