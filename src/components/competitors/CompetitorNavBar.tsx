// src/components/competitors/CompetitorNavBar.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SearchInput } from '@/components/ui/Field'
import { competitorAnchorId } from '@/lib/competitors/anchors'
import { RECENTER_MS, centeredScrollLeft, scrollLeftAt } from '@/lib/competitors/navScroll'

/** 卡片顶边与吸顶块之间留出的呼吸位（px）。 */
const ANCHOR_GAP = 8

export interface NavTarget {
  id: string
  name: string
  handle: string
}

export default function CompetitorNavBar({
  targets,
  selectedId,
  onJump,
}: {
  targets: NavTarget[]
  /** 当前选中的账号:芯片与对应卡片共用这一个来源,保证两处永远指同一个号。 */
  selectedId: string | null
  onJump: (id: string) => void
}) {
  const t = useTranslations('competitors')
  const [query, setQuery] = useState('')
  const rowRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  // 连点两个账号时取消上一段动画,否则两个 rAF 循环会各写各的 scrollLeft、互相抽帧。
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }, [])

  /** 把选中芯片缓动滑到行的正中。测量必须在选中态画出来之后,见 jump 里的注释。 */
  const recenter = (chip: HTMLElement) => {
    const row = rowRef.current
    if (!row) return
    const to = centeredScrollLeft({
      chipStart: chip.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft,
      chipWidth: chip.offsetWidth,
      viewWidth: row.clientWidth,
      contentWidth: row.scrollWidth,
    })
    const from = row.scrollLeft
    if (from === to) return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    // design-system §4:prefers-reduced-motion 下关闭位移动画。这条得在 JS 里
    // 自己判——globals.css 那个 media block 只关 CSS animation,管不到 rAF。
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      row.scrollLeft = to
      return
    }
    // 自己跑 rAF 而不是 scrollTo({behavior:'smooth'}):后者既控不了时长,
    // 也不是所有引擎都真的执行(本项目实测过它是彻底的空操作)。
    const t0 = performance.now()
    const step = (now: number) => {
      const elapsed = now - t0
      row.scrollLeft = scrollLeftAt(from, to, elapsed, RECENTER_MS)
      rafRef.current = elapsed < RECENTER_MS ? requestAnimationFrame(step) : null
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return targets
    return targets.filter((x) => x.name.toLowerCase().includes(q) || x.handle.toLowerCase().includes(q))
  }, [targets, query])

  // 只有一个账号时导航没有意义，整条不渲染。
  if (targets.length < 2) return null

  const jump = (id: string, chip: HTMLElement) => {
    // 顺序是刻意的:① 先落选中态 ② 再让边缘账号滑进来。反过来的话芯片是
    // "滑到中间之后才变色",看起来像列表自己动了一下、点击没反应。
    onJump(id)

    const el = document.getElementById(competitorAnchorId(id))
    if (el) {
      // 不能用 scrollIntoView:它把卡片顶边对齐到视口顶,而视口顶被吸顶块
      // (导航条 + 日期轴)占着,卡片头部会被盖掉一截。偏移量按吸顶块的实测
      // 高度算,而不是写死一个 scroll-mt——那块的高度会随导航条换行、
      // 日期轴列数变化,写死迟早对不上。
      const head = document.querySelector('[data-sticky-head]')
      const offset = (head?.getBoundingClientRect().height ?? 0) + ANCHOR_GAP
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      // behavior:'smooth' 不是所有引擎都真的执行——实测有环境下它是彻底的空操作
      // （同一个元素换成 'auto' 立刻就位），点了芯片却纹丝不动。所以给一个兜底：
      // 发起平滑滚动后下一拍看位置有没有动，没动就直接跳。真会动画的浏览器里
      // 这一拍已经滚了一段，兜底自然不触发。
      const before = window.scrollY
      window.scrollTo({ top, behavior: 'smooth' })
      setTimeout(() => {
        if (window.scrollY === before) window.scrollTo({ top })
      }, 60)
    }

    // 双 rAF = 等 React 把选中态真正画到屏幕上再量再滑。不只是为了顺序好看:
    // 选中态把字重从 400 提到 500,芯片会略微变宽,提前量出来的居中位置是错的。
    requestAnimationFrame(() => requestAnimationFrame(() => recenter(chip)))
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
        // scrollbar-none:滚动条被隐藏了,但可滚性并没有丢——右缘半截芯片就是提示,
        // 触控板/滚轮横滚照常;真要精确找某个号,左边的过滤框比拖滚动条快。
        <div ref={rowRef} className="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {matched.map((x) => {
            const on = x.id === selectedId
            return (
              <button
                key={x.id}
                type="button"
                onClick={(e) => jump(x.id, e.currentTarget)}
                title={`@${x.handle}`}
                aria-label={t('navJumpTo', { name: x.name })}
                aria-current={on ? 'true' : undefined}
                // 选中态与默认态走互斥三元、每个属性只输出一个候选类:同一属性
                // 挂两个类时谁生效由 Tailwind 生成顺序决定、不看书写顺序
                // (FilterChip 里踩过,active 的 font-bold 被 font-semibold 压掉)。
                // hover:* 也必须只留在默认态那一支——否则鼠标一悬停就把实心底色
                // 盖成浅灰,选中态当场消失。
                // 焦点环走 ring-inset 而非共用的 FOCUS_RING:后者带 ring-offset-1,
                // 而 offset 在 overflow-*-auto 容器里会被裁切(design-system §4
                // 第二配方的例外③「滚动容器内的项」,recipes.ts 里也写明了不收进常量)。
                className={`h-7 shrink-0 rounded-btn border px-3 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
                  on
                    ? 'border-primary bg-primary font-medium text-white'
                    : 'border-line-strong bg-surface text-ink-700 hover:bg-row-hover hover:text-ink-900'
                }`}
              >
                {x.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
