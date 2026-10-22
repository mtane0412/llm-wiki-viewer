/**
 * 画面の状態と URL のハッシュ（`#/...`）を相互に変換するモジュールです。
 *
 * ハッシュを使うことで、静的ホスティングでもブラウザの戻る・進むやブックマークが使えます。
 * 形式:
 * - `#/{vaultId}/page/{パス}?h={見出し}` ページ
 * - `#/{vaultId}/lint` lint の指摘一覧
 * - `#/{vaultId}/graph` グラフ
 * - `#/{vaultId}/tags` タグと type の一覧
 * - `#/{vaultId}/tag/{タグ}` タグを持つページの一覧（タグの中の `/` もエンコードします）
 * - `#/{vaultId}/type/{type}` type が一致するページの一覧
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
  | { view: 'tag'; vaultId: string; tag: string }
  | { view: 'type'; vaultId: string; type: string }

/** パスの各区切りを URL エンコードします（`/` は区切りとして残します）。 */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
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
    case 'page': {
      const query = route.heading ? `?h=${encodeURIComponent(route.heading)}` : ''
      return `#/${encodeURIComponent(route.vaultId)}/page/${encodePath(route.path)}${query}`
    }
    case 'lint':
    case 'graph':
    case 'tags':
      return `#/${encodeURIComponent(route.vaultId)}/${route.view}`
    case 'tag':
      return `#/${encodeURIComponent(route.vaultId)}/tag/${encodeURIComponent(route.tag)}`
    case 'type':
      return `#/${encodeURIComponent(route.vaultId)}/type/${encodeURIComponent(route.type)}`
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
    if (view === 'lint' || view === 'graph' || view === 'tags') return { view, vaultId }
    if (view === 'tag' && segments.length === 3) return { view, vaultId, tag: decodeURIComponent(segments[2]) }
    if (view === 'type' && segments.length === 3) return { view, vaultId, type: decodeURIComponent(segments[2]) }
    if (view === 'page' && segments.length > 2) {
      const heading = new URLSearchParams(queryPart).get('h') ?? undefined
      return { view: 'page', vaultId, path: segments.slice(2).map(decodeURIComponent).join('/'), heading }
    }
  } catch {
    // 不正なエンコード（decodeURIComponent の URIError）はスタート画面として扱います
  }
  return { view: 'start' }
}
