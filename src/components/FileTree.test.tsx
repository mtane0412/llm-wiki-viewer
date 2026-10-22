import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { buildWikiIndex } from '../lib/wikiIndex'
import { FileTree } from './FileTree'

const index = buildWikiIndex({
  markdownFiles: [
    { path: 'wiki/index.md', content: '# 目次' },
    { path: 'wiki/concepts/tool-use.md', content: '---\ntitle: Tool use\n---\n本文' },
  ],
  unloadedMarkdownPaths: ['raw/notes/元資料のメモ.md'],
  assetPaths: [],
})

describe('FileTree', () => {
  it('閉じているフォルダの中のページは描画しない', () => {
    render(<FileTree index={index} vaultId="v1" currentPath="wiki/index.md" />)
    expect(screen.queryByRole('link', { name: 'Tool use' })).toBeNull()
    expect(screen.queryByRole('link', { name: '元資料のメモ' })).toBeNull()
  })

  it('フォルダを開くと中のページを描画する', async () => {
    const user = userEvent.setup()
    render(<FileTree index={index} vaultId="v1" currentPath="wiki/index.md" />)
    await user.click(screen.getByText('raw（元資料）'))
    await user.click(await screen.findByText('notes'))
    expect(await screen.findByRole('link', { name: '元資料のメモ' })).toBeInTheDocument()
  })

  it('表示中のページを含むフォルダは最初から開く', () => {
    render(<FileTree index={index} vaultId="v1" currentPath="wiki/concepts/tool-use.md" />)
    expect(screen.getByRole('link', { name: 'Tool use' })).toHaveAttribute('aria-current', 'page')
  })

  it('フォルダの開閉は、開いているかどうかが分かるボタンにする', async () => {
    const user = userEvent.setup()
    render(<FileTree index={index} vaultId="v1" currentPath="wiki/index.md" />)
    // ブラウザ操作エージェントの一部は入れ子の要素の文字を名前に使わないため、名前は aria-label で明示します
    const toggle = screen.getByRole('button', { name: 'concepts（1 ページ）' })
    expect(toggle).toHaveAttribute('aria-label', 'concepts（1 ページ）')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Tool use' })).toBeInTheDocument()
  })

  it('ページのリンクには、パスの title 属性より優先される名前としてページのタイトルを付ける', () => {
    // ブラウザ操作エージェントの一部は、リンクの名前に title 属性を本文より優先して使うため、aria-label で明示します
    render(<FileTree index={index} vaultId="v1" currentPath="wiki/index.md" />)
    const link = screen.getByRole('link', { name: 'index' })
    expect(link).toHaveAttribute('aria-label', 'index')
    expect(link).toHaveAttribute('title', 'wiki/index.md')
  })
})

describe('FileTree の raw/ の CSV', () => {
  it('raw/ の CSV ファイルを、開けるファイルとして一覧に載せる', async () => {
    const withCsv = buildWikiIndex({
      markdownFiles: [{ path: 'wiki/index.md', content: '# 目次' }],
      unloadedMarkdownPaths: [],
      assetPaths: ['raw/survey/votes.csv', 'raw/survey/photo.png'],
    })
    const user = userEvent.setup()
    render(<FileTree index={withCsv} vaultId="v1" currentPath="wiki/index.md" />)
    await user.click(screen.getByText('raw（元資料）'))
    await user.click(await screen.findByText('survey'))
    expect(await screen.findByRole('link', { name: 'votes.csv' })).toHaveAttribute('href', '#/v1/page/raw/survey/votes.csv')
    // 前提: 開く画面の無い画像などは一覧に載せません
    expect(screen.queryByRole('link', { name: 'photo.png' })).toBeNull()
  })
})
