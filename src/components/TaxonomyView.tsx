/**
 * frontmatter の tags と type でページを絞り込む画面のコンポーネントです。
 *
 * - TaxonomyView: type とタグの一覧（件数付き）。各項目から絞り込んだページ一覧へ移動します
 * - PagesByTagView: タグを持つページの一覧
 * - PagesByTypeView: type が一致するページの一覧
 * いずれの画面もハッシュルート（route.ts）で表現するため、URL の共有と再読み込みができます。
 */
import { useId } from 'react'
import { formatRoute } from '../lib/route'
import { countTags, countTypes, pagesWithTag, pagesWithType, type ValueCount } from '../lib/taxonomy'
import type { WikiIndex, WikiPage } from '../lib/wikiIndex'

/** 一覧の画面に共通の引数です。 */
interface TaxonomyProps {
  index: WikiIndex
  vaultId: string
}

/** 件数付きの値の一覧の区画です。 */
function ValueCountSection({ title, items, hrefOf, labelOf, emptyText }: {
  title: string
  items: ValueCount[]
  hrefOf: (value: string) => string
  labelOf: (value: string) => string
  emptyText: string
}) {
  const headingId = useId()
  return (
    <section className="taxonomy-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul className="taxonomy-list">
          {items.map((item) => (
            <li key={item.value}>
              <a href={hrefOf(item.value)}>
                {labelOf(item.value)}
                <span className="count">{item.count}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** type とタグの一覧です。 */
export function TaxonomyView({ index, vaultId }: TaxonomyProps) {
  return (
    <div className="taxonomy">
      <h1>タグと type</h1>
      <ValueCountSection
        title="type"
        items={countTypes(index.pages)}
        hrefOf={(type) => formatRoute({ view: 'type', vaultId, type })}
        labelOf={(type) => type}
        emptyText="type を持つページはありません。"
      />
      <ValueCountSection
        title="タグ"
        items={countTags(index.pages)}
        hrefOf={(tag) => formatRoute({ view: 'tag', vaultId, tag })}
        labelOf={(tag) => `#${tag}`}
        emptyText="タグを持つページはありません。"
      />
    </div>
  )
}

/** 絞り込んだページの一覧です。 */
function FilteredPages({ title, pages, emptyText, vaultId }: { title: string; pages: WikiPage[]; emptyText: string; vaultId: string }) {
  return (
    <div className="taxonomy">
      <p className="muted small">
        <a href={formatRoute({ view: 'tags', vaultId })}>タグと type の一覧</a>
      </p>
      <h1>{title}</h1>
      <p className="muted">{`${pages.length} ページ`}</p>
      {pages.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <ul className="taxonomy-pages" aria-label="ページの一覧">
          {pages.map((page) => (
            <li key={page.path}>
              <a href={formatRoute({ view: 'page', vaultId, path: page.path, heading: undefined })}>{page.title}</a>
              <span className="muted lint-path">{page.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** タグを持つページの一覧です。 */
export function PagesByTagView({ index, vaultId, tag }: TaxonomyProps & { tag: string }) {
  return <FilteredPages title={`#${tag}`} pages={pagesWithTag(index.pages, tag)} emptyText="このタグを持つページはありません。" vaultId={vaultId} />
}

/** type が一致するページの一覧です。 */
export function PagesByTypeView({ index, vaultId, type }: TaxonomyProps & { type: string }) {
  return <FilteredPages title={`type: ${type}`} pages={pagesWithType(index.pages, type)} emptyText="この type のページはありません。" vaultId={vaultId} />
}
