/**
 * HTML の文字列を安全に組み立てるための関数です。
 */

/**
 * HTML の特殊文字（& < > " '）を数値文字参照に置き換えます。
 * Wiki の内容（frontmatter の title など）は信頼できない入力として扱い、HTML として解釈される場所へ渡す前に必ず通します。
 *
 * @param value - エスケープする文字列
 * @returns エスケープした文字列
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}
