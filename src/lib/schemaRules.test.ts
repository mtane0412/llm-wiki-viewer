import { describe, expect, it } from 'vitest'
import { parseFrontmatterRules } from './schemaRules'

/** llm-wiki-init のテンプレートと同じ書式の「Frontmatter（必須）」の節を持つ CLAUDE.md です。 */
const templateSchema = [
  '# Wiki の運用ルール',
  '',
  '### Frontmatter（必須）',
  '',
  '```yaml',
  '---',
  'title: クマトリガー',
  'aliases: []',
  'type: entity | concept | decision | source | analysis | overview',
  'tags: []',
  'sources: ["[[YYYY-MM-DD-source-slug]]"]   # このページの根拠となるソース要約',
  'created: YYYY-MM-DD',
  'updated: YYYY-MM-DD',
  '---',
  '```',
  '',
  '```sh',
  'type: これはコマンドの例で、frontmatter ではない',
  '```',
].join('\n')

describe('parseFrontmatterRules', () => {
  it('type を含む frontmatter の例のコードブロックから、必須項目と type の選択肢を読み取る', () => {
    expect(parseFrontmatterRules(templateSchema)).toEqual({
      // sources は「sources 未記載」の指摘で扱うため、必須項目には含めません
      requiredKeys: { ok: true, value: ['title', 'aliases', 'type', 'tags', 'created', 'updated'] },
      typeValues: { ok: true, value: ['entity', 'concept', 'decision', 'source', 'analysis', 'overview'] },
    })
  })

  it('type の行が | 区切りの選択肢でなければ、type の選択肢は読み取れないとして理由を返す', () => {
    const schema = '```yaml\n---\ntype: organization          # source / person / organization\ntitle: 山口組\n---\n```'
    const rules = parseFrontmatterRules(schema)
    expect(rules.requiredKeys).toEqual({ ok: true, value: ['type', 'title'] })
    expect(rules.typeValues).toEqual({ ok: false, reason: expect.stringContaining('type: a | b | c') })
  })

  it('frontmatter の例ではないコードブロック（yaml でも --- を含むものでもない）の type: の行は使わない', () => {
    const schema = '```ts\ntype: string\nop: ingest\n```\n\n' + templateSchema
    expect(parseFrontmatterRules(schema).typeValues).toEqual({ ok: true, value: ['entity', 'concept', 'decision', 'source', 'analysis', 'overview'] })
  })

  it('日本語のキーや引用符で囲んだキーも必須項目として読み取り、URL の行はキーとみなさない', () => {
    const schema = '```yaml\n---\n"title": 例\n担当者: 山田\ntype: a | b\nhttps://example.com/page\n---\n```'
    expect(parseFrontmatterRules(schema).requiredKeys).toEqual({ ok: true, value: ['title', '担当者', 'type'] })
  })

  it('コメントで任意と書いたキーは必須項目に含めない', () => {
    const schema = '```yaml\n---\ntitle: 例\ntype: a | b\nraw: raw/xxx.md   # 任意（source ページのみ）\ncreated: YYYY-MM-DD  # optional\n---\n```'
    expect(parseFrontmatterRules(schema).requiredKeys).toEqual({ ok: true, value: ['title', 'type'] })
  })

  it('type の選択肢が日本語でも読み取る', () => {
    const schema = '```yaml\n---\ntype: 人物 | 組織 | source\n---\n```'
    expect(parseFrontmatterRules(schema).typeValues).toEqual({ ok: true, value: ['人物', '組織', 'source'] })
  })

  it('必須項目が 1 つも読み取れなければ、判定していないとして理由を返す', () => {
    const schema = '```yaml\n---\nsources: []\ntype: a | b\n---\n```'
    // 前提: type 以外の必須項目が無い例です。type だけは必須項目として読み取れます
    expect(parseFrontmatterRules(schema).requiredKeys).toEqual({ ok: true, value: ['type'] })
    const onlySources = '```yaml\n---\nsources: []\n---\n```'
    expect(parseFrontmatterRules(onlySources).requiredKeys.ok).toBe(false)
  })

  it('frontmatter の例のコードブロックが無ければ、どちらも読み取れないとして理由を返す', () => {
    const rules = parseFrontmatterRules('# 運用ルール\n\n- `type` フィールドは必須（`horse` / `person`）。')
    expect(rules.requiredKeys.ok).toBe(false)
    expect(rules.typeValues.ok).toBe(false)
  })
})
