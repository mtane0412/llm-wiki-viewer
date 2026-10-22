/**
 * 散布図などで、グループ（意見グループ・クラスタ）を色分けする CSS 変数を返すモジュールです。
 *
 * 色は index.css の --graph-1〜8 を順に使い、グループが 8 つを超えると最初の色に戻ります。
 */

/** グループの色に使う CSS 変数の数です（index.css の --graph-1〜8）。 */
const PALETTE_SIZE = 8

/** グループの番号から、色の CSS 変数（var(--graph-N)）を返します。 */
export function groupColor(group: number): string {
  return `var(--graph-${(group % PALETTE_SIZE) + 1})`
}
