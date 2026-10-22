/**
 * raw/ の CSV ファイルを開いたときに表示するコンポーネントです。
 *
 * CSV の見出し行から形式を判定して、表示を切り替えます。
 * - 投票 CSV（1 列目が participant）: 同じフォルダの意見 CSV と組み合わせて、Polis 風の集計（意見グループと合意点）を表示します
 * - 意見 CSV（comment-id と comment-body の列がある）: 意見の一覧を表示します
 * - それ以外: 表として表示します
 */
import { useEffect, useState } from 'react'
import { CsvFormatError, parseCsv } from '../lib/csv'
import { isCommentTable } from '../lib/opinions'
import { dirname, isCsvPath } from '../lib/path'
import { isVoteTable } from '../lib/polis'
import type { WikiIndex } from '../lib/wikiIndex'
import { VoteAnalysisView, type CommentTable } from './VoteAnalysisView'

/** CsvFileView の引数です。 */
export interface CsvFileViewProps {
  /** CSV ファイルのパスです。 */
  path: string
  index: WikiIndex
  readText: (path: string) => Promise<string>
}

/** 読み込みの状態です。 */
type LoadState =
  | { status: 'loading'; path: string }
  | { status: 'error'; path: string; message: string }
  | { status: 'ready'; path: string; rows: string[][]; commentTables: CommentTable[] }

/** 形式の分からない CSV で表示する行数の上限です（大きなファイルで画面が重くならないようにします）。 */
const MAX_TABLE_ROWS = 200

/** CSV ファイルを読み込んで解析します。形式の誤りはファイルのパスを付けたエラーにします。 */
async function readCsv(path: string, readText: (path: string) => Promise<string>): Promise<string[][]> {
  const text = await readText(path)
  try {
    return parseCsv(text)
  } catch (cause) {
    if (cause instanceof CsvFormatError) throw new CsvFormatError(`「${path}」: ${cause.message}`)
    throw cause
  }
}

/** 投票 CSV と同じフォルダにある意見 CSV を読み込みます（パスの順）。 */
async function readSiblingCommentTables(path: string, index: WikiIndex, readText: (path: string) => Promise<string>): Promise<CommentTable[]> {
  const siblings = index.assetPaths
    .filter((other) => other !== path && isCsvPath(other) && dirname(other) === dirname(path))
    .sort((a, b) => a.localeCompare(b))
  const tables = await Promise.all(siblings.map(async (sibling) => ({ path: sibling, rows: await readCsv(sibling, readText) })))
  return tables.filter((table) => isCommentTable(table.rows))
}

/** CSV の行を表として描画します。1 行目は見出し行です。 */
function CsvTable({ rows }: { rows: string[][] }) {
  const [header = [], ...records] = rows
  const shown = records.slice(0, MAX_TABLE_ROWS)
  return (
    <>
      <div className="csv-table-wrapper">
        <table className="csv-table">
          <thead>
            <tr>
              {header.map((name, column) => (
                <th key={column} scope="col">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((record, row) => (
              <tr key={row}>
                {header.map((_, column) => (
                  <td key={column}>{record[column] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {records.length > shown.length && <p className="muted">{`${records.length} 行のうち、先頭の ${shown.length} 行を表示しています。`}</p>}
    </>
  )
}

/** raw/ の CSV ファイルの画面です。 */
export function CsvFileView({ path, index, readText }: CsvFileViewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading', path })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await readCsv(path, readText)
      // 投票 CSV だけが、意見の本文を引くために同じフォルダの意見 CSV を必要とします
      const commentTables = isVoteTable(rows) ? await readSiblingCommentTables(path, index, readText) : []
      return { rows, commentTables }
    })().then(
      ({ rows, commentTables }) => {
        if (!cancelled) setState({ status: 'ready', path, rows, commentTables })
      },
      (cause: unknown) => {
        if (!cancelled) setState({ status: 'error', path, message: cause instanceof Error ? cause.message : String(cause) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [path, index, readText])

  if (state.path !== path || state.status === 'loading') return <p className="muted">読み込み中…</p>
  return (
    <div className="csv-file">
      <h1>{path.split('/').pop()}</h1>
      <p className="muted lint-path">{path}</p>
      {state.status === 'error' ? (
        <p role="alert" className="error-banner">
          {`CSV を読み込めませんでした: ${state.message}`}
        </p>
      ) : isVoteTable(state.rows) ? (
        <VoteAnalysisView key={state.path} voteRows={state.rows} commentTables={state.commentTables} />
      ) : (
        <>
          {isCommentTable(state.rows) && <p className="muted">{`意見 CSV（${state.rows.length - 1} 件の意見）です。`}</p>}
          <CsvTable rows={state.rows} />
        </>
      )}
    </div>
  )
}
