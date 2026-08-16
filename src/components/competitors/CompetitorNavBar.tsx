// src/components/competitors/CompetitorNavBar.tsx
'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SearchInput } from '@/components/ui/Field'
import { competitorAnchorId } from '@/lib/competitors/anchors'
import { FOCUS_RING } from '@/lib/ui/recipes'

export interface NavTarget {
  id: string
  name: string
  handle: string
}

export default function CompetitorNavBar({
  targets,
  onJump,
}: {
  targets: NavTarget[]
  onJump: (id: string) => void
}) {
  const t = useTranslations('competitors')
  const [query, setQuery] = useState('')

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return targets
    return targets.filter((x) => x.name.toLowerCase().includes(q) || x.handle.toLowerCase().includes(q))
  }, [targets, query])

  // 只有一个账号时导航没有意义，整条不渲染。
  if (targets.length < 2) return null

  const jump = (id: string) => {
    const el = document.getElementById(competitorAnchorId(id))
    if (el) {
      // behavior:'smooth' 不是所有引擎都真的执行——实测有环境下它是彻底的空操作
      // （同一个元素换成 'auto' 立刻就位），点了芯片却纹丝不动。所以给一个兜底：
      // 发起平滑滚动后下一拍看位置有没有动，没动就直接跳。真会动画的浏览器里
      // 这一拍已经滚了一段，兜底自然不触发。
      const before = window.scrollY
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => {
        if (window.scrollY === before) el.scrollIntoView({ block: 'start' })
      }, 60)
    }
    onJump(id)
  }

  return (
    <div className="flex items-center gap-3 max-md:flex-col max-md:items-stretch">
      <SearchInput
        size="sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('navFilterPlaceholder')}
        aria-label={t('navFilterPlaceholder')}
        className="md:w-52"
      />
      {matched.length === 0 ? (
        <p className="text-xs text-ink-400">{t('navNoMatch')}</p>
      ) : (
        // 芯片行横向滚动而不换行：账号再多也只占一行高度，不把卡片列表推下去。
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
          {matched.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => jump(x.id)}
              title={`@${x.handle}`}
              aria-label={t('navJumpTo', { name: x.name })}
              className={`h-7 shrink-0 rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink-700 transition-colors hover:bg-row-hover hover:text-ink-900 ${FOCUS_RING}`}
            >
              {x.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
