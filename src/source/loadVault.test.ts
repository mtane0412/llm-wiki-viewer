import { describe, expect, it, vi } from 'vitest'
import { createFakeFileSystem } from '../test/fakeFileSystem'
import { createFileListSource } from './fileListSource'
import { createFsAccessSource } from './fsAccessSource'
import { createVaultLoader } from './loadVault'

describe('createVaultLoader', () => {
  it('wiki/ の Markdown を読み込んで索引を作り、それ以外のファイルは添付として扱う', async () => {
    const fs = createFakeFileSystem('wiki-a', {
      wiki: { 'index.md': '![[diagram.png]] [[concept]]', 'concept.md': '# 概念' },
      raw: { assets: { 'diagram.png': 'PNG' } },
    })
    const loader = createVaultLoader(createFsAccessSource(fs.root))
    const { index } = await loader.load()
    expect(index.pages.map((page) => page.path)).toEqual(['wiki/concept.md', 'wiki/index.md'])
    expect(index.assetPaths).toEqual(['raw/assets/diagram.png'])
    expect(index.backlinks.get('raw/assets/diagram.png')).toEqual(['wiki/index.md'])
  })

  it('raw/ の Markdown は内容を読まずに、未読み込みのページとして索引に載せる', async () => {
    const fs = createFakeFileSystem('wiki-raw', { wiki: { 'index.md': '[[raw/notes/memo]]' }, raw: { notes: { 'memo.md': '# 元資料' } } })
    const source = createFsAccessSource(fs.root)
    const readText = vi.spyOn(source, 'readText')
    const { index } = await createVaultLoader(source).load()
    expect(index.pageByPath.get('raw/notes/memo.md')).toMatchObject({ area: 'raw', loaded: false, body: '' })
    expect(index.backlinks.get('raw/notes/memo.md')).toEqual(['wiki/index.md'])
    expect(readText.mock.calls.map(([path]) => path)).toEqual(['wiki/index.md'])
  })

  it('wiki/ がある場合は、wiki/ と raw/ 以外のフォルダをたどらない', async () => {
    const fs = createFakeFileSystem('wiki-tools', { wiki: { 'index.md': '# 目次' }, tools: { 'script.md': '# 道具' } })
    const source = createFsAccessSource(fs.root)
    const listFiles = vi.spyOn(source, 'listFiles')
    await createVaultLoader(source).load()
    const includeDir = listFiles.mock.calls[0][0]?.includeDir
    expect(includeDir?.('tools')).toBe(false)
    expect(includeDir?.('wiki')).toBe(true)
    expect(includeDir?.('raw')).toBe(true)
  })

  it('2 回目の読み込みでは変更されたファイルだけを読み直す', async () => {
    const fs = createFakeFileSystem('wiki-b', { wiki: { 'index.md': '[[a]]', 'a.md': '# A' } })
    const source = createFsAccessSource(fs.root)
    const readText = vi.spyOn(source, 'readText')
    const loader = createVaultLoader(source)
    await loader.load()
    fs.writeFile('wiki/a.md', '# A（更新）')
    readText.mockClear()
    const { index } = await loader.load()
    expect(index.pageByPath.get('wiki/a.md')?.body).toBe('# A（更新）')
    expect(readText.mock.calls.map(([path]) => path)).toEqual(['wiki/a.md'])
  })

  it('hasChanges は wiki/ の追加・変更だけを調べ、raw/ はたどらない', async () => {
    const fs = createFakeFileSystem('wiki-c', { wiki: { 'index.md': '# 目次' }, raw: { 'memo.md': 'メモ' } })
    const source = createFsAccessSource(fs.root)
    const loader = createVaultLoader(source)
    await loader.load()
    const listFiles = vi.spyOn(source, 'listFiles')
    expect(await loader.hasChanges()).toBe(false)
    expect(listFiles.mock.calls[0][0]?.includeDir?.('raw')).toBe(false)
    fs.writeFile('wiki/new.md', '# 新しいページ')
    expect(await loader.hasChanges()).toBe(true)
  })

  it('リポジトリ直下の CLAUDE.md をスキーマとして読み込み、変更を検知して読み直す', async () => {
    const fs = createFakeFileSystem('wiki-schema', { 'CLAUDE.md': '# スキーマ v1', wiki: { 'index.md': '# 目次' } })
    const loader = createVaultLoader(createFsAccessSource(fs.root))
    expect((await loader.load()).index.schema?.content).toBe('# スキーマ v1')
    fs.writeFile('CLAUDE.md', '# スキーマ v2')
    expect(await loader.hasChanges()).toBe(true)
    expect((await loader.load()).index.schema?.content).toBe('# スキーマ v2')
  })

  it('フォルダ選択の入力欄から読み込んだ場合も、リポジトリ直下の CLAUDE.md をスキーマとして読み込む', async () => {
    const file = new File(['# スキーマ'], 'CLAUDE.md')
    Object.defineProperty(file, 'webkitRelativePath', { value: 'my-wiki/CLAUDE.md' })
    const page = new File(['# 目次'], 'index.md')
    Object.defineProperty(page, 'webkitRelativePath', { value: 'my-wiki/wiki/index.md' })
    const { index } = await createVaultLoader(createFileListSource([file, page])).load()
    expect(index.schema).toEqual({ path: 'CLAUDE.md', content: '# スキーマ' })
  })

  it('wiki/ が無い場合は、raw/ 以外のすべてを Wiki として監視する', async () => {
    const fs = createFakeFileSystem('flat', { 'INDEX.md': '# 目次', raw: { 'memo.md': 'メモ' } })
    const loader = createVaultLoader(createFsAccessSource(fs.root))
    const { index } = await loader.load()
    expect(index.wikiRoot).toBe('')
    expect(index.pageByPath.get('raw/memo.md')?.loaded).toBe(false)
    fs.writeFile('INDEX.md', '# 更新')
    expect(await loader.hasChanges()).toBe(true)
  })
})
