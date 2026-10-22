/**
 * wikilink のホバープレビューを表示するコンポーネントです。
 *
 * - リンクにマウスを重ねたとき、またはキーボードでフォーカスしたときに、リンク先のタイトル・type・本文の冒頭を表示します
 * - マウスを離す・フォーカスを外す・Escape キーで閉じます
 * - 表示中はリンクの aria-describedby にプレビューを関連付け、スクリーンリーダーでも内容を読めるようにします
 * - 内容（previewOf）は開いたときにだけ作ります
 */
import { useId, useState, type ReactNode } from 'react'
import { previewOf } from '../lib/preview'
import type { WikiIndex } from '../lib/wikiIndex'

/** プレビューする対象です。 */
export type PreviewTarget = { kind: 'page'; path: string; heading: string | undefined } | { kind: 'missing'; target: string }

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
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  return (
    <span
      className="link-preview-anchor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      {renderTrigger(open ? tooltipId : undefined)}
      {open && (
        <span role="tooltip" id={tooltipId} className="link-preview">
          <PreviewCard index={index} target={target} />
        </span>
      )}
    </span>
  )
}
