// src/components/competitors/ShotDateStrip.tsx
'use client'

import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { UNDATED_KEY } from '@/lib/competitors/shotGrid'

export default function ShotDateStrip({
  axis, dateWindow, selectedDate, onPick,
}: {
  axis: string[]
  dateWindow: string[]
  selectedDate: string | null
  onPick: (date: string) => void
}) {
  const t = useTranslations('competitors')
  if (axis.length === 0) return null

  const first = dateWindow[0]
  const last = dateWindow[dateWindow.length - 1]
  const atStart = axis.indexOf(first) <= 0
  const atEnd = axis.indexOf(last) >= axis.length - 1

  // 整屏翻:轴上累积几个月后逐天点会点到手废
  const step = (direction: -1 | 1) => {
    const anchor = selectedDate ?? last
    const target = axis.indexOf(anchor) + direction * dateWindow.length
    const next = axis[Math.min(Math.max(target, 0), axis.length - 1)]
    if (next) onPick(next)
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('shotDates')}>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={atStart}
        aria-label={t('earlierDates')}
        className="shrink-0 rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40"
      >
        <ChevronLeft size={14} />
      </button>
      <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${dateWindow.length}, minmax(0, 1fr))` }}>
        {dateWindow.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            aria-pressed={d === selectedDate}
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
      <button
        type="button"
        onClick={() => step(1)}
        disabled={atEnd}
        aria-label={t('laterDates')}
        className="shrink-0 rounded border border-line px-1 py-1 text-ink-500 hover:text-ink-900 disabled:opacity-40"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
