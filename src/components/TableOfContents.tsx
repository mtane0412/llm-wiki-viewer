/**
 * ページの見出しから作った目次を表示するコンポーネントです。
 *
 * 広い画面では本文の横に、狭い画面では本文の上に折りたたんで表示します。
 * 項目は見出しつきのページ URL（`?h=見出し`）を指すため、移動すると URL にも反映され、
 * PageView がその見出しまでスクロールします。
 */
import { useState } from 'react'
import { formatRoute } from '../lib/route'
import type { TocHeading } from '../lib/toc'

/** 目次を最初から開いておく画面幅の条件です。App.css の目次の段組みの切り替えと揃えます。 */
const WIDE_SCREEN_QUERY = '(min-width: 1280px)'

/** TableOfContents の引数です。 */
export interface TableOfContentsProps {
  headings: TocHeading[]
  vaultId: string
  pagePath: string
  /** 表示中の見出し（URL の `?h=`）です。 */
  currentHeading: string | undefined
}

/** 目次を最初から開いておくかを、画面幅から決めます。画面幅を調べられない環境では開いておきます。 */
function initiallyOpen(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_SCREEN_QUERY).matches : true
}

/** ページの目次です。 */
export function TableOfContents({ headings, vaultId, pagePath, currentHeading }: TableOfContentsProps) {
  const [open] = useState(initiallyOpen)
  // 最も浅い見出しを 1 段目として字下げします（h2 から始まるページでも左端から並べるため）
  const minDepth = Math.min(...headings.map((heading) => heading.depth))

  return (
    <nav className="toc" aria-label="目次">
      <details open={open}>
        <summary>目次</summary>
        <ol>
          {headings.map((heading, position) => (
            <li key={position} data-depth={heading.depth} style={{ paddingInlineStart: `${heading.depth - minDepth}em` }}>
              <a
                href={formatRoute({ view: 'page', vaultId, path: pagePath, heading: heading.text })}
                aria-current={heading.text === currentHeading ? 'location' : undefined}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  )
}
