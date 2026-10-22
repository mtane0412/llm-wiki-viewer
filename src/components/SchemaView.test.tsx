import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { SchemaView } from './SchemaView'

describe('SchemaView', () => {
  it('CLAUDE.md の内容を Markdown として表示し、wikilink を Wiki のページへのリンクにする', () => {
    const index = buildWikiIndex({
      markdownFiles: [
        { path: 'CLAUDE.md', content: '# LLM Wiki の運用ルール\n\n目次は [[index]] に置く。' },
        { path: 'wiki/index.md', content: '---\ntitle: 目次\n---\n本文' },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    if (!index.schema) throw new Error('テストデータにスキーマがありません')
    render(<SchemaView schema={index.schema} index={index} vaultId="v1" heading={undefined} readBlob={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'LLM Wiki の運用ルール' })).toBeInTheDocument()
    expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '目次' })).toHaveAttribute('href', '#/v1/page/wiki/index.md')
  })

  /** 指定した内容の CLAUDE.md を持つ Wiki のスキーマ画面を表示するヘルパーです。 */
  function renderSchema(content: string) {
    const index = buildWikiIndex({
      markdownFiles: [
        { path: 'CLAUDE.md', content },
        { path: 'wiki/index.md', content: '# 目次' },
      ],
      unloadedMarkdownPaths: [],
      assetPaths: [],
    })
    if (!index.schema) throw new Error('テストデータにスキーマがありません')
    window.scrollTo = vi.fn()
    render(<SchemaView schema={index.schema} index={index} vaultId="v1" heading={undefined} readBlob={vi.fn()} />)
  }

  it('CLAUDE.md の frontmatter は本文として描画しない', () => {
    renderSchema('---\nname: 料理の Wiki\n---\n# 運用ルール')
    expect(screen.getByRole('heading', { level: 1, name: '運用ルール' })).toBeInTheDocument()
    expect(screen.queryByText(/name: 料理の Wiki/)).toBeNull()
  })

  it('CLAUDE.md の中の見出しへのリンクは、スキーマ画面の見出しを指す', () => {
    renderSchema('# 運用ルール\n\n[ワークフローへ](#ワークフロー)\n\n## ワークフロー')
    expect(screen.getByRole('link', { name: 'ワークフローへ' })).toHaveAttribute('href', `#/v1/schema?h=${encodeURIComponent('ワークフロー')}`)
  })
})
