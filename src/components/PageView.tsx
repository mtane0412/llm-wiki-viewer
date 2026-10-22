/**
 * Wiki の 1 ページを表示するコンポーネントです。
 *
 * frontmatter のメタ情報（type・tags・updated・sources）、本文、バックリンク、見出しの目次を表示します。
 * ソース要約ページと、frontmatter の sources で根拠に挙げられているページでは、
 * 根拠にしているページ（sources 由来の被参照）を本文のバックリンクと分けて表示します。
 * Wiki ルート直下の log.md（作業ログ）は、本文の代わりにタイムラインとして表示します（目次は表示しません）。
 * `[[page#見出し]]` で開いた場合は、その見出しまでスクロールします。
 */
import { useEffect, useMemo } from 'react'
import { isLogPage } from '../lib/log'
import { basename } from '../lib/path'
import { createWikilinkOptions } from '../lib/remarkWikilink'
import { formatRoute } from '../lib/route'
import { extractHeadings } from '../lib/toc'
import { isSourcePage, type WikiIndex, type WikiPage } from '../lib/wikiIndex'
import { LogTimeline } from './LogTimeline'
import { MarkdownView } from './MarkdownView'
import { TableOfContents } from './TableOfContents'

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

/** LinkListSection の引数です。 */
interface LinkListSectionProps {
  /** 区画の見出しと、区画のアクセシブルな名前です。 */
  label: string
  paths: string[]
  /** ページが 1 件も無いときに表示する文です。 */
  emptyText: string
  index: WikiIndex
  vaultId: string
}

/** ページの下部に置く、ページへのリンクの一覧の区画です（バックリンクと、根拠にしているページ）。 */
function LinkListSection({ label, paths, emptyText, index, vaultId }: LinkListSectionProps) {
  return (
    <section className="backlinks" aria-label={label}>
      <h2>
        {label} <span className="count">{paths.length}</span>
      </h2>
      {paths.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul>
          {paths.map((path) => (
            <li key={path}>
              <PageLink index={index} vaultId={vaultId} path={path} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Wiki の 1 ページです。 */
export function PageView({ page, index, vaultId, heading, readBlob }: PageViewProps) {
  const backlinks = index.backlinks.get(page.path) ?? []
  const citations = index.citations.get(page.path) ?? []
  const isSource = isSourcePage(page, index.wikiRoot)
  const isLog = page.area === 'wiki' && isLogPage(page.path, index.wikiRoot)
  // 文字列が空の見出し（画像だけの見出しなど）は目次から移動できないため除きます
  const headings = useMemo(
    () => (isLog ? [] : extractHeadings(page.body, createWikilinkOptions(index, page.path, vaultId)).filter((item) => item.text !== '')),
    [isLog, page.body, page.path, index, vaultId],
  )

  useEffect(() => {
    if (heading) document.getElementById(heading)?.scrollIntoView({ block: 'start' })
    else window.scrollTo?.({ top: 0 })
  }, [page.path, heading])

  return (
    <div className="page-layout">
      {headings.length > 0 && <TableOfContents headings={headings} vaultId={vaultId} pagePath={page.path} currentHeading={heading} />}
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
                  <a className="badge" href={formatRoute({ view: 'type', vaultId, type: page.type })}>
                    {page.type}
                  </a>
                </dd>
              </div>
            )}
            {page.tags.length > 0 && (
              <div>
                <dt>tags</dt>
                <dd className="tag-list">
                  {page.tags.map((tag) => (
                    <a key={tag} className="tag" href={formatRoute({ view: 'tag', vaultId, tag })}>{`#${tag}`}</a>
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

        {isLog ? (
          <LogTimeline markdown={page.body} index={index} pagePath={page.path} vaultId={vaultId} readBlob={readBlob} />
        ) : (
          <MarkdownView markdown={page.body} index={index} pagePath={page.path} vaultId={vaultId} readBlob={readBlob} />
        )}

        {(isSource || citations.length > 0) && (
          <LinkListSection
            label={isSource ? 'このソースを根拠にしているページ' : 'このページを根拠にしているページ'}
            paths={citations}
            emptyText="このソースを sources に挙げているページはありません。"
            index={index}
            vaultId={vaultId}
          />
        )}
        <LinkListSection
          label="バックリンク"
          paths={backlinks}
          emptyText="このページにリンクしているページはありません。"
          index={index}
          vaultId={vaultId}
        />
      </article>
    </div>
  )
}
