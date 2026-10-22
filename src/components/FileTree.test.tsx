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
})
