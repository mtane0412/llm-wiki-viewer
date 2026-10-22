/**
 * 内容をまだ読み込んでいないページ（raw/ の元資料）を、開いたときに読み込んで表示するコンポーネントです。
 *
 * 読み込んだ内容は表示にだけ使い、索引（リンク・lint・検索）には反映しません。
 */
import { useEffect, useState } from 'react'
import { parseFrontmatter } from '../lib/frontmatter'
import type { WikiIndex, WikiPage } from '../lib/wikiIndex'
import { PageView } from './PageView'

/** DeferredPageView の引数です。 */
export interface DeferredPageViewProps {
  page: WikiPage
  index: WikiIndex
  vaultId: string
  heading: string | undefined
  readText: (path: string) => Promise<string>
  readBlob: (path: string) => Promise<Blob>
}

/** 読み込みの状態です。 */
type LoadState = { path: string; page?: WikiPage; error?: string }

/** 開いたときに内容を読み込むページです。 */
export function DeferredPageView({ page, index, vaultId, heading, readText, readBlob }: DeferredPageViewProps) {
  const [state, setState] = useState<LoadState>({ path: page.path })

  useEffect(() => {
    let cancelled = false
    readText(page.path).then(
      (text) => {
        if (cancelled) return
        const { data, body } = parseFrontmatter(text)
        const title = typeof data.title === 'string' ? data.title : page.title
        setState({ path: page.path, page: { ...page, title, frontmatter: data, body, loaded: true } })
      },
      (cause: unknown) => {
        if (!cancelled) setState({ path: page.path, error: cause instanceof Error ? cause.message : String(cause) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [page, readText])

  if (state.path !== page.path) return <p className="muted">読み込み中…</p>
  if (state.error) {
    return (
      <p role="alert" className="error-banner">
        {`「${page.path}」を読み込めませんでした: ${state.error}`}
      </p>
    )
  }
  if (!state.page) return <p className="muted">読み込み中…</p>
  return <PageView page={state.page} index={index} vaultId={vaultId} heading={heading} readBlob={readBlob} />
}
