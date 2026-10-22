/**
 * 最近の更新と、前回の閲覧以降に内容が変わったページを判定するモジュールです。
 *
 * 判定の方法:
 * - ページの内容（frontmatter と本文）からハッシュを計算し、ページを開いた時点のハッシュを「既読」として記録します
 * - 既読の記録とハッシュが違うページは「更新あり」、既読の記録に無いページは「新規」です
 * - 判定の対象は内容を読み込んだ wiki のページだけです（raw/ の元資料は内容を読み込まないため対象外です）
 * ファイルの更新時刻は、内容が同じでも書き直しで変わるため使いません。frontmatter の updated は LLM が書き忘れることがあるため、
 * 判定には使わず、一覧の並び順にだけ使います。
 */
import type { WikiPage } from './wikiIndex'

/** ページのパスと、既読にした時点の内容のハッシュの対応です。 */
export type SeenState = Record<string, string>

/** 前回の閲覧以降の変化の種類です。 */
export type PageChange = 'new' | 'changed'

/** 変化の判定の対象になるページかを判定します。 */
function isTracked(page: WikiPage): boolean {
  return page.area === 'wiki' && page.loaded
}

/**
 * ページの内容（frontmatter と本文）のハッシュを計算します（32 ビットの FNV-1a を 16 進数にしたもの）。
 *
 * 変化の検知にだけ使うため、暗号学的な強さは必要ありません。
 *
 * @param page - ページ
 * @returns ハッシュの文字列
 */
export function hashPage(page: WikiPage): string {
  const text = JSON.stringify([page.frontmatter, page.body])
  let hash = 0x811c9dc5
  for (let position = 0; position < text.length; position++) {
    hash ^= text.charCodeAt(position)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 判定の対象のページすべてを既読とした記録を作ります。初めて開いた Wiki の基準に使います。
 *
 * @param pages - 索引のページ
 * @returns パスとハッシュの対応
 */
export function snapshotOf(pages: WikiPage[]): SeenState {
  return Object.fromEntries(pages.filter(isTracked).map((page) => [page.path, hashPage(page)]))
}

/**
 * 既読の記録と比べて、内容が変わったページと新しいページを返します。
 *
 * @param pages - 索引のページ
 * @param seen - 既読の記録
 * @returns パスと変化の種類の対応（変化の無いページは含みません）
 */
export function detectChanges(pages: WikiPage[], seen: SeenState): Map<string, PageChange> {
  const changes = new Map<string, PageChange>()
  for (const page of pages.filter(isTracked)) {
    const seenHash = seen[page.path]
    if (seenHash === undefined) changes.set(page.path, 'new')
    else if (seenHash !== hashPage(page)) changes.set(page.path, 'changed')
  }
  return changes
}

/**
 * frontmatter の updated があるページを、新しい順に並べます。
 *
 * @param pages - 索引のページ
 * @returns updated の新しい順（同じ日付ならタイトルの順）のページ。updated の無いページは含みません
 */
export function recentlyUpdated(pages: WikiPage[]): WikiPage[] {
  return pages
    .filter((page) => page.area === 'wiki' && page.updated !== undefined)
    .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '') || a.title.localeCompare(b.title))
}
