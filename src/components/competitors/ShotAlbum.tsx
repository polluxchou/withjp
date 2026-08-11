// src/components/competitors/ShotAlbum.tsx
'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { UNDATED_KEY, groupShotsByDate } from '@/lib/competitors/shotGrid'
import ShotUploader from './ShotUploader'
import ShotLightbox from './ShotLightbox'
import type { CompetitorShot } from '@/lib/competitors/types'

function DateCell({ shots, dateKey, compact, selected, onOpen }: {
  shots: CompetitorShot[]
  dateKey: string
  compact: boolean
  selected: boolean
  onOpen: () => void
}) {
  const t = useTranslations('competitors')
  const box = compact ? 'h-32' : 'h-[46vh] min-h-[300px]'

  if (!shots.length) {
    // role="img" 是必要的：aria-label 挂在裸 div 上多数读屏根本不播报。
    // 无日期列要单独一句文案,否则会拼出 "No shot on Undated" 这种病句。
    return (
      <div
        role="img"
        aria-label={dateKey === UNDATED_KEY ? t('noShotUndated') : t('noShotOnDate', { date: dateKey })}
        className={`${box} rounded-lg border border-dashed border-line-soft`}
      />
    )
  }

  const cover = shots[0]
  const extra = shots.length - 1

  return (
    <div className={`relative ${box} overflow-hidden rounded-lg bg-canvas ${selected ? 'ring-2 ring-primary' : ''}`}>
      <button type="button" onClick={onOpen} className="block h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover.image_url} alt={cover.caption || cover.tag || ''} className="h-full w-full object-cover" loading="lazy" />
      </button>
      {extra > 0 && (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
          {t('moreShots', { count: extra })}
        </span>
      )}
      {cover.tag && (
        <span className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">
          {cover.tag}
        </span>
      )}
    </div>
  )
}

export default function ShotAlbum({
  competitorId, shots, canEdit, onChanged, dateWindow, selectedDate, compact = false,
}: {
  competitorId: string
  shots: CompetitorShot[]
  canEdit: boolean
  onChanged: () => void
  dateWindow: string[]
  selectedDate: string | null
  compact?: boolean
}) {
  const t = useTranslations('competitors')
  const [openDate, setOpenDate] = useState<string | null>(null)
  const grouped = useMemo(() => groupShotsByDate(shots), [shots])

  if (dateWindow.length === 0) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-muted-text">{t('noShots')}</p>
        {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} />}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {canEdit && (
        <div className="mb-2 flex justify-end">
          <ShotUploader competitorId={competitorId} onDone={onChanged} />
        </div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${dateWindow.length}, minmax(0, 1fr))` }}>
        {dateWindow.map((d) => (
          <DateCell
            key={d}
            shots={grouped.get(d) ?? []}
            dateKey={d}
            compact={compact}
            selected={d === selectedDate}
            onOpen={() => setOpenDate(d)}
          />
        ))}
      </div>
      {openDate && (
        <ShotLightbox
          // key 保证换一天就重新挂载,index 不会带着上一天的值过来
          key={openDate}
          shots={grouped.get(openDate) ?? []}
          canEdit={canEdit}
          onClose={() => setOpenDate(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}
