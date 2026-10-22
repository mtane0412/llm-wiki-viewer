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

/** ページごとの計算済みのハッシュです。索引が作り直されるとページも作り直されるため、古いページごと捨てられます。 */
const hashCache = new WeakMap<WikiPage, string>()

/**
 * 文字列の 53 ビットのハッシュ（cyrb53）を 16 進数で返します。
 *
 * 変化の検知にだけ使うため暗号学的な強さは必要ありませんが、編集を見逃さないよう衝突しにくい 53 ビットにします。
 */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let position = 0; position < text.length; position++) {
    const code = text.charCodeAt(position)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/**
 * ページの内容（frontmatter と本文）のハッシュを返します。同じページの 2 回目以降は計算済みの値を返します。
 *
 * @param page - ページ
 * @returns ハッシュの文字列
 */
export function hashPage(page: WikiPage): string {
  const cached = hashCache.get(page)
  if (cached !== undefined) return cached
  const hash = cyrb53(JSON.stringify([page.frontmatter, page.body]))
  hashCache.set(page, hash)
  return hash
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

/** 日付の順に並べられる updated の形式（YYYY-MM-DD で始まるもの）です。 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

/** ページの updated が、日付の順に並べられる形式かを判定します。 */
export function hasSortableUpdated(page: WikiPage): boolean {
  return page.updated !== undefined && ISO_DATE.test(page.updated)
}

/**
 * frontmatter の updated があるページを、新しい順に並べます。
 *
 * @param pages - 索引のページ
 * @returns updated の新しい順（同じ日付ならタイトルの順）のページ。updated が無いか YYYY-MM-DD の形式でないページは含みません
 */
export function recentlyUpdated(pages: WikiPage[]): WikiPage[] {
  return pages
    .filter((page) => page.area === 'wiki' && hasSortableUpdated(page))
    .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '') || a.title.localeCompare(b.title))
}
