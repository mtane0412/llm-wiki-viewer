import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from './frontmatter'

describe('parseFrontmatter', () => {
  it('YAML の frontmatter と本文を分離する', () => {
    const text = '---\ntitle: エージェントループ\ntags: [loop, agent]\n---\n\n# 本文の見出し\n'
    const result = parseFrontmatter(text)
    expect(result.data).toEqual({ title: 'エージェントループ', tags: ['loop', 'agent'] })
    expect(result.body).toBe('\n# 本文の見出し\n')
    expect(result.error).toBeUndefined()
  })

  it('frontmatter が無い場合は空のデータと本文全体を返す', () => {
    const result = parseFrontmatter('# 見出しだけのページ\n')
    expect(result.data).toEqual({})
    expect(result.body).toBe('# 見出しだけのページ\n')
    expect(result.hasFrontmatter).toBe(false)
  })

  it('CRLF の改行でも frontmatter を認識する', () => {
    const result = parseFrontmatter('---\r\ntitle: 改行コード\r\n---\r\n本文\r\n')
    expect(result.data).toEqual({ title: '改行コード' })
    expect(result.body).toBe('本文\r\n')
  })

  it('YAML が壊れている場合は error にメッセージを入れ、本文は frontmatter を除いて返す', () => {
    const result = parseFrontmatter('---\ntitle: [閉じ忘れ\n---\n本文\n')
    expect(result.error).toMatch(/.+/)
    expect(result.data).toEqual({})
    expect(result.body).toBe('本文\n')
  })

  it('YAML の値がオブジェクトでない場合はエラーとして扱う', () => {
    const result = parseFrontmatter('---\nただの文字列\n---\n本文\n')
    expect(result.error).toMatch(/オブジェクト/)
  })
})
