/**
 * 広聴AI（kouchou-ai）と同じ形式の意見 CSV を読むモジュールです。
 *
 * 意見 CSV は `comment-id`（意見の id）と `comment-body`（意見の本文）の列を持ち、ほかの列（年代・地域など）は属性として保持します。
 * Polis のエクスポートの comments.csv も同じ列名を持つため、そのまま読めます。
 */
import { CsvFormatError } from './csv'

/** 意見の id の列名です。 */
const ID_COLUMN = 'comment-id'
/** 意見の本文の列名です。 */
const BODY_COLUMN = 'comment-body'

/** 意見 1 件です。 */
export interface Comment {
  id: string
  body: string
  /** comment-id・comment-body 以外の列の値です（列名 → 値）。 */
  attributes: Record<string, string>
}

/**
 * CSV が意見 CSV（見出し行に comment-id と comment-body がある）かを判定します。
 *
 * @param rows - parseCsv の結果
 * @returns 意見 CSV なら true
 */
export function isCommentTable(rows: string[][]): boolean {
  const header = rows[0] ?? []
  return header.includes(ID_COLUMN) && header.includes(BODY_COLUMN)
}

/**
 * 意見 CSV の行から意見を読みます。
 *
 * @param rows - parseCsv の結果（1 行目は見出し行）
 * @returns ファイルの順に並べた意見
 * @throws CsvFormatError - 必要な列が無い場合、comment-id が空または重複している場合
 */
export function parseCommentTable(rows: string[][]): Comment[] {
  const [header = [], ...records] = rows
  const idIndex = header.indexOf(ID_COLUMN)
  const bodyIndex = header.indexOf(BODY_COLUMN)
  if (idIndex < 0 || bodyIndex < 0) throw new CsvFormatError(`意見 CSV には ${ID_COLUMN} と ${BODY_COLUMN} の列が必要です。`)

  const seen = new Set<string>()
  return records.map((record, position) => {
    // 見出し行を 1 行目として数えます
    const rowNumber = position + 2
    const id = (record[idIndex] ?? '').trim()
    if (id === '') throw new CsvFormatError(`${rowNumber} 行目の ${ID_COLUMN} が空です。`)
    if (seen.has(id)) throw new CsvFormatError(`${rowNumber} 行目の ${ID_COLUMN}「${id}」が重複しています。`)
    seen.add(id)
    const attributes: Record<string, string> = {}
    header.forEach((name, column) => {
      if (column !== idIndex && column !== bodyIndex) attributes[name] = record[column] ?? ''
    })
    return { id, body: record[bodyIndex] ?? '', attributes }
  })
}
