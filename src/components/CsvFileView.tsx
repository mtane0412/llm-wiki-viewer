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
  | { status: 'ready'; path: string; rows: string[][]; siblings: SiblingTables }

/** 投票 CSV と同じフォルダにある CSV の読み込み結果です。 */
interface SiblingTables {
  /** 意見 CSV です（パスの順）。 */
  commentTables: CommentTable[]
  /** 形式の誤りなどで読めなかった CSV と、その理由です。 */
  unreadable: { path: string; message: string }[]
}

/** 投票 CSV でない CSV の、同じフォルダの CSV の読み込み結果です（読み込みません）。 */
const NO_SIBLINGS: SiblingTables = { commentTables: [], unreadable: [] }

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

/**
 * 投票 CSV と同じフォルダにある CSV を読み込み、意見 CSV を選び出します。
 * 関係の無い CSV の誤りで集計全体が止まらないよう、読めなかった CSV は理由とともに別に返し、画面で示します。
 */
async function readSiblingTables(path: string, index: WikiIndex, readText: (path: string) => Promise<string>): Promise<SiblingTables> {
  const siblings = index.assetPaths
    .filter((other) => other !== path && isCsvPath(other) && dirname(other) === dirname(path))
    .sort((a, b) => a.localeCompare(b))
  const commentTables: CommentTable[] = []
  const unreadable: SiblingTables['unreadable'] = []
  const results = await Promise.all(
    siblings.map(async (sibling): Promise<{ ok: true; path: string; rows: string[][] } | { ok: false; path: string; message: string }> => {
      try {
        return { ok: true, path: sibling, rows: await readCsv(sibling, readText) }
      } catch (cause) {
        return { ok: false, path: sibling, message: cause instanceof Error ? cause.message : String(cause) }
      }
    }),
  )
  for (const result of results) {
    if (!result.ok) unreadable.push({ path: result.path, message: result.message })
    else if (isCommentTable(result.rows)) commentTables.push({ path: result.path, rows: result.rows })
  }
  return { commentTables, unreadable }
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
      const siblings = isVoteTable(rows) ? await readSiblingTables(path, index, readText) : NO_SIBLINGS
      return { rows, siblings }
    })().then(
      ({ rows, siblings }) => {
        if (!cancelled) setState({ status: 'ready', path, rows, siblings })
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
        <>
          {state.siblings.unreadable.map((item) => (
            <p key={item.path} className="lint-unavailable">{`同じフォルダの CSV を読めなかったため、意見 CSV の候補から除きました: ${item.message}`}</p>
          ))}
          <VoteAnalysisView key={state.path} voteRows={state.rows} commentTables={state.siblings.commentTables} />
        </>
      ) : (
        <>
          {isCommentTable(state.rows) && <p className="muted">{`意見 CSV（${state.rows.length - 1} 件の意見）です。`}</p>}
          <CsvTable rows={state.rows} />
        </>
      )}
    </div>
  )
}
