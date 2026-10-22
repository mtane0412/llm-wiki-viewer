/**
 * 画面の状態から、ブラウザのタブに表示するタイトル（`document.title`）を作るモジュールです。
 *
 * 形式は「画面の名前 - Wiki の名前 - LLM Wiki Viewer」です。タブの一覧やブラウザ操作エージェントが、
 * URL を解読しなくても表示中の画面を判別できるようにします。
 */
import type { Route } from './route'
import type { WikiIndex } from './wikiIndex'

/** アプリの名前です。すべてのタイトルの末尾に付けます。 */
const APP_NAME = 'LLM Wiki Viewer'

/** タイトルを作るために必要な Wiki の情報です。 */
export interface TitleVault {
  name: string
  /** 読み込み前は null です。null の場合、ページの画面ではパスをタイトルの代わりにします。 */
  index: WikiIndex | null
}

/** 画面の名前を返します。Wiki のホーム（画面の名前が無い）は null です。 */
function viewName(route: Exclude<Route, { view: 'start' }>, index: WikiIndex | null): string | null {
  switch (route.view) {
    case 'home':
      return null
    case 'page':
      return index?.pageByPath.get(route.path)?.title ?? route.path
    case 'lint':
      return 'Lint'
    case 'graph':
      return 'グラフ'
    case 'tags':
      return 'タグ'
    case 'callouts':
      return '未解決'
    case 'recent':
      return '最近'
    case 'schema':
      return 'スキーマ（CLAUDE.md）'
    case 'tag':
      return `タグ: ${route.tag}`
    case 'type':
      return `type: ${route.type}`
    case 'search':
      return `検索: ${route.query}`
  }
}

/**
 * 画面の状態からタブのタイトルを作ります。
 *
 * @param route - 画面の状態
 * @param vault - 表示中の Wiki。開いていない場合は undefined です
 * @returns タブのタイトル
 */
export function documentTitle(route: Route, vault: TitleVault | undefined): string {
  if (route.view === 'start' || !vault) return APP_NAME
  const name = viewName(route, vault.index)
  return [name, vault.name, APP_NAME].filter((part) => part !== null).join(' - ')
}
