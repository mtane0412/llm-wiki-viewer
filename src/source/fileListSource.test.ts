import { describe, expect, it } from 'vitest'
import { createFileListSource } from './fileListSource'

/** `<input webkitdirectory>` が返す File と同じく、webkitRelativePath を持つ File を作ります。 */
function fileAt(relativePath: string, content: string): File {
  const file = new File([content], relativePath.split('/').pop() ?? relativePath, { lastModified: 1 })
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath })
  return file
}

describe('createFileListSource', () => {
  const source = createFileListSource([
    fileAt('my-wiki/wiki/index.md', '# 目次'),
    fileAt('my-wiki/raw/memo.md', 'メモ'),
    fileAt('my-wiki/raw/repos/codex/README.md', '複製したリポジトリ'),
    fileAt('my-wiki/raw/repos/codex/.git/HEAD', 'ref'),
    fileAt('my-wiki/.obsidian/app.json', '{}'),
  ])

  it('先頭のフォルダ名を Wiki の名前にし、変更の監視はできないものとする', () => {
    expect(source.name).toBe('my-wiki')
    expect(source.watchable).toBe(false)
  })

  it('先頭のフォルダ名を除いたパスで列挙し、隠しフォルダと複製リポジトリは除く', async () => {
    expect((await source.listFiles()).map((entry) => entry.path)).toEqual(['wiki/index.md', 'raw/memo.md'])
  })

  it('includeDir で、たどるフォルダを絞り込める', async () => {
    expect((await source.listFiles({ includeDir: (path) => path !== 'raw' })).map((entry) => entry.path)).toEqual(['wiki/index.md'])
  })

  it('フォルダの有無を調べる', async () => {
    expect(await source.hasDirectory('wiki')).toBe(true)
    expect(await source.hasDirectory('raw/repos/codex')).toBe(false)
  })

  it('テキストを読む', async () => {
    expect(await source.readText('raw/memo.md')).toBe('メモ')
  })

  it('ファイルが 1 つも無い場合はエラーにする', () => {
    expect(() => createFileListSource([])).toThrow(/ファイル/)
  })
})
