import type { ReactNode } from 'react'
import { findFirstAutoLink } from './autoLinkTerms.ts'

// 把文案里第一次出现的登记品牌名（autoLinkTerms.ts 的 AUTO_LINK_TERMS）渲染成
// 加粗外链，其余文本原样保留。`seen` 由调用方传入并跨多次调用共享，用来实现
// 「同一篇文章/同一处文案只处理各个品牌名的第一次出现」——见 createAutoLinker。
export function autoLinkText(text: string, seen: Set<string>): ReactNode {
  const split = findFirstAutoLink(text, seen)
  if (!split) return text
  return (
    <>
      {split.before}
      <strong>
        <a href={split.url} target="_blank" rel="noopener noreferrer">
          {split.match}
        </a>
      </strong>
      {autoLinkText(split.after, seen)}
    </>
  )
}

// 每篇新闻/每个页面实例化一次，返回的函数在该篇文章/该页面内所有取值调用之间
// 共享同一个「已处理品牌名」集合。
export function createAutoLinker() {
  const seen = new Set<string>()
  return (text: string) => autoLinkText(text, seen)
}
