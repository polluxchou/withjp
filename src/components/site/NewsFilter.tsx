'use client'

import { useState } from 'react'
import type { SiteArticle } from '@/lib/site/news'
import NewsRow from './NewsRow'

/**
 * NEWS 的分类筛选。设计稿里这排药丸是静态装饰，落地做成真的可点 ——
 * 画得像按钮却点不动，比不画更糟。
 */
export default function NewsFilter({
  filters,
  articles,
  emptyLabel,
}: {
  /** 第一项是「全部」 */
  filters: string[]
  articles: SiteArticle[]
  emptyLabel: string
}) {
  const [active, setActive] = useState(0)
  const visible = active === 0 ? articles : articles.filter((a) => a.tag === filters[active])

  return (
    <>
      <div className="mb-7 flex flex-wrap gap-2.5">
        {filters.map((label, i) => {
          const on = i === active
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => setActive(i)}
              className={`border px-3.5 py-1.5 font-condensed text-[13px] tracking-[0.14em] transition-colors ${
                on
                  ? 'border-site-accent bg-site-hot text-site-on-hot'
                  : 'border-site-line-strong text-site-fg/70 hover:text-site-fg'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="border-t border-site-line">
        {visible.map((article) => (
          <NewsRow key={article.slug} article={article} />
        ))}
        {visible.length === 0 && <p className="py-10 text-[15px] text-site-fg/50">{emptyLabel}</p>}
      </div>
    </>
  )
}
