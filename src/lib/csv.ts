/**
 * CSV（RFC 4180）を解析するモジュールです。
 *
 * ダブルクォートで囲んだセルの中のカンマ・改行・二重のダブルクォート（`""`）、先頭の BOM、CRLF の改行を扱います。
 * 空行は読み飛ばします。形式の誤りは、どこが誤っているかを示す CsvFormatError にします。
 */

/** CSV の形式の誤りです。メッセージに誤りのある行・列を含めます。 */
export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvFormatError'
  }
}

/**
 * CSV の文字列を、セルの配列（行）の配列にします。
 *
 * @param text - CSV ファイルの内容
 * @returns 行の配列。1 行目は見出し行です
 * @throws CsvFormatError - ダブルクォートが閉じられていない場合
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  // エラーで示す、ダブルクォートが始まった行の番号（ファイルの物理行、1 始まり）です
  let line = 1
  let quoteStartLine = 1

  const endRow = () => {
    row.push(cell)
    // 空行（セルが 1 つで空のもの）は読み飛ばします
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
    cell = ''
  }

  for (let position = 0; position < source.length; position++) {
    const char = source[position]
    if (inQuotes) {
      if (char === '"') {
        if (source[position + 1] === '"') {
          cell += '"'
          position++
        } else {
          inQuotes = false
        }
      } else {
        if (char === '\n') line++
        cell += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      quoteStartLine = line
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      // CRLF は 1 つの改行として扱います
      if (char === '\r' && source[position + 1] === '\n') position++
      line++
      endRow()
    } else {
      cell += char
    }
  }
  if (inQuotes) throw new CsvFormatError(`${quoteStartLine} 行目で始まったダブルクォートが閉じられていません。`)
  if (cell !== '' || row.length > 0) endRow()
  return rows
}
