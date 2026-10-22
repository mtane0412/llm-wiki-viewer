/**
 * 画面の状態と URL のハッシュ（`#/...`）を相互に変換するモジュールです。
 *
 * ハッシュを使うことで、静的ホスティングでもブラウザの戻る・進むやブックマークが使えます。
 * 形式:
 * - `#/{vaultId}/page/{パス}?h={見出し}` ページ
 * - `#/{vaultId}/lint` lint の指摘一覧
 * - `#/{vaultId}/graph` グラフ
 * - `#/{vaultId}/tags` タグと type の一覧
 * - `#/{vaultId}/callouts` 未解決の矛盾・問い（warning・question の callout）の一覧
 * - `#/{vaultId}/recent` 最近の更新と、前回の閲覧以降に変わったページ
 * - `#/{vaultId}/schema?h={見出し}` リポジトリ直下の CLAUDE.md（Wiki のスキーマ）
 * - `#/{vaultId}/tag/{タグ}` タグを持つページの一覧（タグの中の `/` もエンコードします）
 * - `#/{vaultId}/type/{type}` type が一致するページの一覧
 * - `#/{vaultId}/search?q={検索語}&all=1` 検索結果（`all=1` はすべての Wiki が対象）
 * - `#/{vaultId}` Wiki のホーム
 */

/** 画面の状態です。 */
export type Route =
  | { view: 'start' }
  | { view: 'home'; vaultId: string }
  | { view: 'page'; vaultId: string; path: string; heading: string | undefined }
  | { view: 'lint'; vaultId: string }
  | { view: 'graph'; vaultId: string }
  | { view: 'tags'; vaultId: string }
  | { view: 'callouts'; vaultId: string }
  | { view: 'recent'; vaultId: string }
  | { view: 'schema'; vaultId: string; heading: string | undefined }
  | { view: 'tag'; vaultId: string; tag: string }
  | { view: 'type'; vaultId: string; type: string }
  | { view: 'search'; vaultId: string; query: string; all: boolean }

/** パスの各区切りを URL エンコードします（`/` は区切りとして残します）。 */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** 見出しを指定する URL のクエリ（`?h=見出し`）です。見出しが無ければ空文字です。 */
function headingQuery(heading: string | undefined): string {
  return heading ? `?h=${encodeURIComponent(heading)}` : ''
}

/**
 * 画面の状態を URL のハッシュに変換します。
 *
 * @param route - 画面の状態
 * @returns `#` から始まるハッシュ
 */
export function formatRoute(route: Route): string {
  switch (route.view) {
    case 'start':
      return '#/'
    case 'home':
      return `#/${encodeURIComponent(route.vaultId)}`
    case 'page':
      return `#/${encodeURIComponent(route.vaultId)}/page/${encodePath(route.path)}${headingQuery(route.heading)}`
    case 'lint':
    case 'graph':
    case 'tags':
    case 'callouts':
    case 'recent':
      return `#/${encodeURIComponent(route.vaultId)}/${route.view}`
    case 'schema':
      return `#/${encodeURIComponent(route.vaultId)}/schema${headingQuery(route.heading)}`
    case 'tag':
      return `#/${encodeURIComponent(route.vaultId)}/tag/${encodeURIComponent(route.tag)}`
    case 'type':
      return `#/${encodeURIComponent(route.vaultId)}/type/${encodeURIComponent(route.type)}`
    case 'search': {
      const params = new URLSearchParams({ q: route.query })
      if (route.all) params.set('all', '1')
      return `#/${encodeURIComponent(route.vaultId)}/search?${params.toString()}`
    }
  }
}

/**
 * URL のハッシュを画面の状態に変換します。解釈できない場合はスタート画面にします。
 *
 * @param hash - `location.hash` の値
 * @returns 画面の状態
 */
export function parseRoute(hash: string): Route {
  const [pathPart, queryPart = ''] = hash.replace(/^#\/?/, '').split('?')
  const segments = pathPart.split('/').filter(Boolean)
  if (segments.length === 0) return { view: 'start' }
  try {
    const vaultId = decodeURIComponent(segments[0])
    const view = segments[1]
    if (view === undefined) return { view: 'home', vaultId }
    if (view === 'lint' || view === 'graph' || view === 'tags' || view === 'callouts' || view === 'recent') return { view, vaultId }
    if (view === 'schema') return { view, vaultId, heading: new URLSearchParams(queryPart).get('h') ?? undefined }
    if (view === 'tag' && segments.length === 3) return { view, vaultId, tag: decodeURIComponent(segments[2]) }
    if (view === 'type' && segments.length === 3) return { view, vaultId, type: decodeURIComponent(segments[2]) }
    if (view === 'search') {
      const params = new URLSearchParams(queryPart)
      return { view, vaultId, query: params.get('q') ?? '', all: params.get('all') === '1' }
    }
    if (view === 'page' && segments.length > 2) {
      const heading = new URLSearchParams(queryPart).get('h') ?? undefined
      return { view: 'page', vaultId, path: segments.slice(2).map(decodeURIComponent).join('/'), heading }
    }
  } catch {
    // 不正なエンコード（decodeURIComponent の URIError）はスタート画面として扱います
  }
  return { view: 'start' }
}
