import { describe, expect, it, vi } from 'vitest'
import { createFakeFileSystem } from '../test/fakeFileSystem'
import { createFsAccessSource } from './fsAccessSource'

describe('createFsAccessSource', () => {
  const fs = createFakeFileSystem('coding-agent-llm-wiki', {
    'CLAUDE.md': '# スキーマ',
    wiki: { 'index.md': '# 目次', concepts: { 'tool-use.md': '# ツール' } },
    raw: {
      assets: { 'diagram.png': 'PNG' },
      repos: { codex: { '.git': { HEAD: 'ref' }, 'README.md': '複製したリポジトリ' } },
    },
    '.git': { HEAD: 'ref: refs/heads/main' },
    node_modules: { pkg: { 'README.md': '無視' } },
  })
  const source = createFsAccessSource(fs.root)

  it('フォルダ名を Wiki の名前にする', () => {
    expect(source.name).toBe('coding-agent-llm-wiki')
    expect(source.watchable).toBe(true)
  })

  it('隠しフォルダ・node_modules・.git を持つ複製リポジトリを除いて、すべてのファイルを列挙する', async () => {
    const entries = await source.listFiles()
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      'CLAUDE.md',
      'raw/assets/diagram.png',
      'wiki/concepts/tool-use.md',
      'wiki/index.md',
    ])
  })

  it('includeDir で、たどるフォルダを絞り込める', async () => {
    const entries = await source.listFiles({ includeDir: (path) => path !== 'raw' })
    expect(entries.map((entry) => entry.path).sort()).toEqual(['CLAUDE.md', 'wiki/concepts/tool-use.md', 'wiki/index.md'])
  })

  it('withMetadata が false のファイルは、ファイルを開かずにパスだけを返す', async () => {
    const entries = await source.listFiles({ withMetadata: (path) => !path.startsWith('raw/') })
    expect(entries.find((entry) => entry.path === 'raw/assets/diagram.png')).toEqual({ path: 'raw/assets/diagram.png', lastModified: null, size: null })
    expect(entries.find((entry) => entry.path === 'wiki/index.md')?.lastModified).toEqual(expect.any(Number))
  })

  it('フォルダの有無を調べる', async () => {
    expect(await source.hasDirectory('wiki')).toBe(true)
    expect(await source.hasDirectory('存在しない')).toBe(false)
  })

  it('パスを指定してテキストを読む', async () => {
    expect(await source.readText('wiki/concepts/tool-use.md')).toBe('# ツール')
  })

  it('パスを指定してバイナリを読む', async () => {
    const blob = await source.readBlob('raw/assets/diagram.png')
    expect(await blob.text()).toBe('PNG')
  })

  it('存在しないパスを読むとエラーになる', async () => {
    await expect(source.readText('wiki/無い.md')).rejects.toThrow()
  })

  it('NotFoundError 以外のエラーはフォルダの有無の判定で握りつぶさない', async () => {
    const broken = createFsAccessSource({
      name: '壊れたフォルダ',
      getDirectoryHandle: vi.fn(async () => {
        throw new DOMException('拒否されました', 'NotAllowedError')
      }),
    } as unknown as FileSystemDirectoryHandle)
    await expect(broken.hasDirectory('wiki')).rejects.toThrow('拒否されました')
  })
})
