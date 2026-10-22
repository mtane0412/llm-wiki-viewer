import { describe, expect, it } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('HTML の特殊文字を文字参照に置き換える', () => {
    expect(escapeHtml(`<img src=x onerror="alert('攻撃')">&`)).toBe('&#60;img src=x onerror=&#34;alert(&#39;攻撃&#39;)&#34;&#62;&#38;')
  })

  it('特殊文字を含まない文字列はそのまま返す', () => {
    expect(escapeHtml('システム状態の可視性')).toBe('システム状態の可視性')
  })
})
