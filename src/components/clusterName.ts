/**
 * 意見クラスタの番号から、画面に表示する名前（クラスタ 1・2…）を作るモジュールです。
 */

/** クラスタの番号（0 始まり）から表示名を作ります。 */
export function clusterName(id: number): string {
  return `クラスタ ${id + 1}`
}
