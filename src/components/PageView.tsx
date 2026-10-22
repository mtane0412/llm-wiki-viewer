/**
 * Wiki の 1 ページを表示するコンポーネントです。
 *
 * frontmatter のメタ情報（type・tags・updated・sources）、本文、バックリンクを表示します。
 * `[[page#見出し]]` で開いた場合は、その見出しまでスクロールします。
 */
import { useEffect } from 'react'
import { basename } from '../lib/path'
import { formatRoute } from '../lib/route'
import type { WikiIndex, WikiPage } from '../lib/wikiIndex'
import { MarkdownView } from './MarkdownView'

/** PageView の引数です。 */
export interface PageViewProps {
  page: WikiPage
  index: WikiIndex
  vaultId: string
  heading: string | undefined
  readBlob: (path: string) => Promise<Blob>
}

/** 本文が h1 の見出しで始まるかを判定します。始まらない場合はタイトルを h1 として表示します。 */
function startsWithH1(body: string): boolean {
  const firstLine = body.split(/\r?\n/).find((line) => line.trim() !== '')
  return firstLine !== undefined && /^#\s/.test(firstLine.trim())
}

/** ページへのリンクを描画します。 */
function PageLink({ index, vaultId, path }: { index: WikiIndex; vaultId: string; path: string }) {
  return (
    <a href={formatRoute({ view: 'page', vaultId, path, heading: undefined })} className="wikilink">
      {index.pageByPath.get(path)?.title ?? basename(path)}
    </a>
  )
}

/** Wiki の 1 ページです。 */
export function PageView({ page, index, vaultId, heading, readBlob }: PageViewProps) {
  const backlinks = index.backlinks.get(page.path) ?? []

  useEffect(() => {
    if (heading) document.getElementById(heading)?.scrollIntoView({ block: 'start' })
    else window.scrollTo?.({ top: 0 })
  }, [page.path, heading])

  return (
    <article className="page">
      <header className="page-header">
        <p className="page-path">
          {page.area === 'raw' && <span className="badge badge-raw">元資料</span>}
          {page.path}
        </p>
        {!startsWithH1(page.body) && <h1 className="page-title">{page.title}</h1>}
        <dl className="page-meta">
          {page.type && (
            <div>
              <dt>type</dt>
              <dd>
                <span className="badge">{page.type}</span>
              </dd>
            </div>
          )}
          {page.tags.length > 0 && (
            <div>
              <dt>tags</dt>
              <dd className="tag-list">
                {page.tags.map((tag) => (
                  <span key={tag} className="tag">{`#${tag}`}</span>
                ))}
              </dd>
            </div>
          )}
          {page.aliases.length > 0 && (
            <div>
              <dt>aliases</dt>
              <dd>{page.aliases.join('、')}</dd>
            </div>
          )}
          {page.updated && (
            <div>
              <dt>updated</dt>
              <dd>{page.updated}</dd>
            </div>
          )}
          {page.sources.length > 0 && (
            <div>
              <dt>sources</dt>
              <dd>
                <ul className="source-list">
                  {page.sources.map((target) => {
                    const resolved = index.resolve(target, page.path)
                    return (
                      <li key={target}>
                        {resolved ? (
                          <PageLink index={index} vaultId={vaultId} path={resolved} />
                        ) : (
                          <span className="wikilink-broken" title={`リンク先が見つかりません: ${target}`}>
                            {target}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </header>

      <MarkdownView markdown={page.body} index={index} pagePath={page.path} vaultId={vaultId} readBlob={readBlob} />

      <section className="backlinks" aria-label="バックリンク">
        <h2>
          バックリンク <span className="count">{backlinks.length}</span>
        </h2>
        {backlinks.length === 0 ? (
          <p className="muted">このページにリンクしているページはありません。</p>
        ) : (
          <ul>
            {backlinks.map((path) => (
              <li key={path}>
                <PageLink index={index} vaultId={vaultId} path={path} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
