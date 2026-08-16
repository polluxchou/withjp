// src/components/competitors/ShotDateStrip.tsx
'use client'

import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SHOT_WINDOW_SIZE, UNDATED_KEY } from '@/lib/competitors/shotGrid'

export default function ShotDateStrip({
  axis, dateWindow, selectedDate, onPick,
}: {
  axis: string[]
  dateWindow: string[]
  selectedDate: string | null
  onPick: (date: string) => void
}) {
  const t = useTranslations('competitors')
  // dateWindow 才是渲染依据,axis 非空不代表窗口非空
  if (axis.length === 0 || dateWindow.length === 0) return null

  const first = dateWindow[0]
  const last = dateWindow[dateWindow.length - 1]
  const atStart = axis.indexOf(first) <= 0
  const atEnd = axis.indexOf(last) >= axis.length - 1

  // 整屏翻,且连选中的那天一起挪 —— 高亮永远留在屏幕上。
  // 轴上累积几个月后逐天点会点到手废。
  const step = (direction: -1 | 1) => {
    const anchor = selectedDate ?? last
    const target = axis.indexOf(anchor) + direction * dateWindow.length
    const next = axis[Math.min(Math.max(target, 0), axis.length - 1)]
    if (next) onPick(next)
  }

  return (
    // 外层 px-4 对齐卡片的 p-4,内层复刻卡片的 minmax(0,1fr)/minmax(0,3fr) 轨道与 gap-3。
    // 这是必须的:格子里不显示任何日期文字,日期条是屏幕上唯一能看到日期的地方,
    // chip 必须正好落在它标注的那一列上方,否则用户只能靠数格子来对应。
    // 吸顶不在这一层做:日期轴和账号导航条要作为一整块吸顶(否则两个
    // sticky top-0 会叠在一起),吸顶容器与不透明底色都提到
    // CompetitorDossierView 的 [data-sticky-head] 上。
    <div className="px-4 py-2">
      <div
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-3 max-md:grid-cols-1"
        role="group"
        aria-label={t('shotDates')}
      >
        <div className="flex items-center justify-end gap-1 max-md:justify-start">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={atStart}
            aria-label={t('earlierDates')}
            className="rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atEnd}
            aria-label={t('laterDates')}
            className="rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${SHOT_WINDOW_SIZE}, minmax(0, 1fr))` }}>
          {dateWindow.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={d === selectedDate}
              title={d === UNDATED_KEY ? undefined : d}
              aria-label={d === UNDATED_KEY ? undefined : d}
              className={`truncate rounded px-1 py-1 text-center text-[11px] ${
                d === selectedDate
                  ? 'bg-primary-soft text-primary'
                  : 'text-ink-500 hover:bg-row-hover'
              }`}
            >
              {d === UNDATED_KEY ? t('undated') : d.slice(5)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
