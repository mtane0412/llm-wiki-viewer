/**
 * `<input type="file" webkitdirectory>` でフォルダを選ぶ入力欄です。
 *
 * File System Access API が無いブラウザ（Safari・Firefox）向けのフォールバックです。
 * 選んだ時点のスナップショットを読むため、ファイルの変更は反映されません。
 */
import { useId } from 'react'

/** FolderInput の引数です。 */
export interface FolderInputProps {
  /** 入力欄のラベルです。 */
  label: string
  /** フォルダが選ばれたときに呼ばれます。 */
  onSelect: (files: File[]) => void
}

/** フォルダ選択の入力欄です。 */
export function FolderInput({ label, onSelect }: FolderInputProps) {
  const id = useId()
  return (
    <span className="folder-input">
      <label htmlFor={id} className="button">
        {label}
      </label>
      <input
        id={id}
        type="file"
        multiple
        className="visually-hidden"
        // webkitdirectory は React の型定義に無いため、DOM の属性として直接設定します
        ref={(element) => element?.setAttribute('webkitdirectory', '')}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length > 0) onSelect(files)
        }}
      />
    </span>
  )
}
