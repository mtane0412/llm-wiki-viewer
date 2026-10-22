/**
 * wikilink のホバープレビューを表示するコンポーネントです。
 *
 * - リンクにマウスを重ねたとき、またはキーボードでフォーカスしたときに、リンク先のタイトル・type・本文の冒頭を表示します
 * - マウスを離す・フォーカスを外す・Escape キー（フォーカスの位置を問いません）・ページのスクロールで閉じます
 * - 表示中はリンクの aria-describedby にプレビューを関連付け、スクリーンリーダーでも内容を読めるようにします
 * - プレビューは画面を基準に、リンクの直下（隙間なし）に置き、画面の右端からはみ出さないよう左へずらします。
 *   表やコードの横スクロールの領域の中のリンクでも、領域に切られずに表示できます
 * - 内容（previewOf）は開いたときにだけ作ります
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { previewOf } from '../lib/preview'
import type { WikiIndex } from '../lib/wikiIndex'

/** プレビューする対象です。 */
export type PreviewTarget = { kind: 'page'; path: string; heading: string | undefined } | { kind: 'missing'; target: string }

/** プレビューの幅（px）の上限です。App.css の .link-preview の width と揃えます。 */
const PREVIEW_WIDTH_PX = 352

/** プレビューと画面の端との最小の間隔（px）です。 */
const VIEWPORT_MARGIN_PX = 8

/** プレビューを置く位置（画面の左上からの px）です。 */
interface PreviewPosition {
  top: number
  left: number
}

/** リンクの位置から、画面の右端からはみ出さないプレビューの位置を求めます。 */
function positionBelow(trigger: Element): PreviewPosition {
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(PREVIEW_WIDTH_PX, window.innerWidth - VIEWPORT_MARGIN_PX * 2)
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN_PX))
  return { top: rect.bottom, left }
}

/** LinkPreview の引数です。 */
export interface LinkPreviewProps {
  index: WikiIndex
  target: PreviewTarget
  /** プレビューを開く要素を描画します。開いている間は、プレビューの要素の id が渡されます。 */
  renderTrigger: (describedBy: string | undefined) => ReactNode
}

/** プレビューの中身です。 */
function PreviewCard({ index, target }: { index: WikiIndex; target: PreviewTarget }) {
  if (target.kind === 'missing') {
    return (
      <>
        <span className="link-preview-title">{target.target}</span>
        <span className="link-preview-note">このページはまだ作成されていません。</span>
      </>
    )
  }
  const preview = previewOf(index, target.path, target.heading)
  if (preview.kind === 'unloaded') {
    return (
      <>
        <span className="link-preview-title">{preview.title}</span>
        <span className="link-preview-note">元資料です。本文はページを開いたときに読み込みます。</span>
      </>
    )
  }
  return (
    <>
      <span className="link-preview-title">
        {preview.title}
        {preview.heading && <span className="link-preview-heading">{` › ${preview.heading}`}</span>}
      </span>
      {preview.type && <span className="badge">{preview.type}</span>}
      {preview.missingHeading ? (
        <span className="link-preview-note">{`見出し「${preview.heading}」が見つかりません。`}</span>
      ) : (
        <span className="link-preview-excerpt">{preview.excerpt || '本文はありません。'}</span>
      )}
    </>
  )
}

/** リンクとそのホバープレビューです。 */
export function LinkPreview({ index, target, renderTrigger }: LinkPreviewProps) {
  const [position, setPosition] = useState<PreviewPosition | null>(null)
  const tooltipId = useId()
  const open = position !== null

  // 開いている間は、マウスで開いた場合でも Escape で閉じられるよう文書全体のキー操作を受け付けます。
  // プレビューは画面を基準に置くため、ページがスクロールしたら閉じます
  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, { capture: true, passive: true })
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, { capture: true })
    }
  }, [open])

  return (
    <span
      className="link-preview-anchor"
      onMouseEnter={(event) => setPosition(positionBelow(event.currentTarget))}
      onMouseLeave={() => setPosition(null)}
      onFocus={(event) => setPosition(positionBelow(event.currentTarget))}
      onBlur={() => setPosition(null)}
    >
      {renderTrigger(open ? tooltipId : undefined)}
      {position && (
        <span role="tooltip" id={tooltipId} className="link-preview" style={{ top: position.top, left: position.left }}>
          <PreviewCard index={index} target={target} />
        </span>
      )}
    </span>
  )
}
