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

  it('frontmatter の例のコードブロックが無ければ、どちらも読み取れないとして理由を返す', () => {
    const rules = parseFrontmatterRules('# 運用ルール\n\n- `type` フィールドは必須（`horse` / `person`）。')
    expect(rules.requiredKeys.ok).toBe(false)
    expect(rules.typeValues.ok).toBe(false)
  })
})
