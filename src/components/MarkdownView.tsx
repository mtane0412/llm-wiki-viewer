/**
 * Wiki のページ本文（Markdown）を描画するコンポーネントです。
 *
 * - wikilink をページへのリンクに、`![[画像]]` を画像に変換します（remarkWikilink.ts）
 * - 通常の Markdown リンクで書いた相対パスの .md もページへのリンクにします
 * - 画像はフォルダ内のファイルを読み込み、Blob URL で表示します
 * - 見出しには見出しの文字列を id として付け、`[[page#見出し]]` で移動できるようにします
 */
import { useEffect, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import Markdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { basename, dirname, joinPath } from '../lib/path'
import { EMBED_CLASS, remarkWikilink } from '../lib/remarkWikilink'
import { formatRoute } from '../lib/route'
import type { WikiIndex } from '../lib/wikiIndex'

/** MarkdownView の引数です。 */
export interface MarkdownViewProps {
  /** 描画する Markdown（frontmatter を除いた本文）です。 */
  markdown: string
  index: WikiIndex
  /** 表示中のページのパスです。相対リンクの基準になります。 */
  pagePath: string
  vaultId: string
  /** フォルダ内のファイルを読み込む関数です。 */
  readBlob: (path: string) => Promise<Blob>
}

/** 外部の URL（スキームつき）かどうかを判定する正規表現です。 */
const EXTERNAL_URL = /^[a-z][a-z0-9+.-]*:/i

/** React の子要素から文字列だけを取り出します。見出しの id に使います。 */
function textOf(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textOf).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return textOf((children.props as { children?: ReactNode }).children)
  }
  return ''
}

/** URL エンコードされたパスを元に戻します。不正なエンコードの場合はそのまま返します。 */
function safeDecode(value: string): string {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

/** フォルダ内の画像を読み込んで表示するコンポーネントです。 */
function VaultImage({ path, alt, readBlob }: { path: string; alt: string; readBlob: (path: string) => Promise<Blob> }) {
  const [state, setState] = useState<{ path: string; url?: string; error?: string }>({ path })

  useEffect(() => {
    let objectUrl: string | undefined
    let cancelled = false
    readBlob(path).then(
      (blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setState({ path, url: objectUrl })
      },
      (cause: unknown) => {
        if (!cancelled) setState({ path, error: cause instanceof Error ? cause.message : String(cause) })
      },
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, readBlob])

  if (state.path === path && state.error) {
    return <span className="wikilink-broken" title={state.error}>{`画像を読み込めません: ${path}`}</span>
  }
  return state.path === path && state.url ? <img src={state.url} alt={alt} /> : <span className="image-loading">{alt}</span>
}

/** 見出しのコンポーネントを作ります。見出しの文字列を id にします。 */
function heading(Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  return function Heading({ children, node: _node, ...rest }: ComponentPropsWithoutRef<typeof Tag> & { node?: unknown }) {
    return (
      <Tag id={textOf(children).trim()} {...rest}>
        {children}
      </Tag>
    )
  }
}

/** Wiki のページ本文を描画します。 */
export function MarkdownView({ markdown, index, pagePath, vaultId, readBlob }: MarkdownViewProps) {
  const remarkPlugins = useMemo<NonNullable<Options['remarkPlugins']>>(
    () => [
      remarkGfm,
      [
        remarkWikilink,
        {
          resolve: (target: string) => index.resolve(target, pagePath),
          titleOf: (path: string) => index.pageByPath.get(path)?.title ?? basename(path),
          hrefOf: (path: string, heading: string | undefined) => formatRoute({ view: 'page', vaultId, path, heading }),
        },
      ],
    ],
    [index, pagePath, vaultId],
  )

  const components = useMemo<Components>(() => {
    /** 相対パスのリンクを Wiki 内のページへのリンクに変換します。変換できなければ null です。 */
    const toInternalHref = (href: string): string | null => {
      const [rawPath, fragment] = safeDecode(href).split('#')
      if (!rawPath) return formatRoute({ view: 'page', vaultId, path: pagePath, heading: fragment || undefined })
      const joined = joinPath(dirname(pagePath), rawPath)
      const path = joined !== null && index.pageByPath.has(joined) ? joined : index.resolve(rawPath, pagePath)
      return path ? formatRoute({ view: 'page', vaultId, path, heading: fragment || undefined }) : null
    }

    return {
      a({ href = '', children, node: _node, ...rest }) {
        if (href.startsWith('#/')) return <a href={href} {...rest}>{children}</a>
        if (EXTERNAL_URL.test(href)) {
          return <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
        }
        const internal = toInternalHref(href)
        if (internal) return <a href={internal} className="wikilink">{children}</a>
        return <span className="wikilink-broken" title={`リンク先が見つかりません: ${href}`}>{children}</span>
      },
      img({ src = '', alt = '', className }) {
        if (typeof src !== 'string') return null
        if (EXTERNAL_URL.test(src)) return <img src={src} alt={alt} />
        const decoded = safeDecode(src)
        const path = className?.includes(EMBED_CLASS) ? decoded : joinPath(dirname(pagePath), decoded)
        if (path === null) return <span className="wikilink-broken">{`画像のパスが不正です: ${decoded}`}</span>
        return <VaultImage path={path} alt={alt} readBlob={readBlob} />
      },
      h1: heading('h1'),
      h2: heading('h2'),
      h3: heading('h3'),
      h4: heading('h4'),
      h5: heading('h5'),
      h6: heading('h6'),
    }
  }, [index, pagePath, vaultId, readBlob])

  return (
    <div className="markdown">
      <Markdown remarkPlugins={remarkPlugins} components={components}>
        {markdown}
      </Markdown>
    </div>
  )
}
