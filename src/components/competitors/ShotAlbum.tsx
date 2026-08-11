// src/components/competitors/ShotAlbum.tsx
'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SHOT_WINDOW_SIZE, UNDATED_KEY, groupShotsByDate } from '@/lib/competitors/shotGrid'
import ShotUploader from './ShotUploader'
import ShotLightbox from './ShotLightbox'
import type { CompetitorShot } from '@/lib/competitors/types'

// 格子是 overflow-hidden 的全出血容器，FOCUS_RING 的 offset 变体会被裁掉一圈，
// 按 §4 第二配方①改用 ring-inset，故不导入 FOCUS_RING。
const CELL_FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset'

function DateCell({ shots, dateKey, selected, onOpen }: {
  shots: CompetitorShot[]
  dateKey: string
  selected: boolean
  onOpen: () => void
}) {
  const t = useTranslations('competitors')
  // 宽度由网格决定,高度必须交给比例。旧缩略图是 h-[46vh] w-[26vh],两个维度
  // 都绑在 vh 上所以比例恒为 9:16、其实不裁;只留高度那一半的话,1080p 上一张
  // 竖屏截图会被 object-cover 横向裁掉约 40%,大屏近 60% —— 并排主播、右侧
  // 礼物榜、左侧弹幕列全在被切掉的那两条里,只剩中间一条看得出"有人在播"。
  const box = 'aspect-[9/16]'
  // 描边两个分支都要:一列里空格子越多,越需要它告诉你看的是同一天
  const ring = selected ? 'ring-2 ring-primary' : ''

  if (!shots.length) {
    // role="img" 是必要的：aria-label 挂在裸 div 上多数读屏根本不播报。
    // 无日期列要单独一句文案,否则会拼出 "No shot on Undated" 这种病句。
    return (
      <div
        role="img"
        aria-label={dateKey === UNDATED_KEY ? t('noShotUndated') : t('noShotOnDate', { date: dateKey })}
        className={`${box} ${ring} rounded-field border border-dashed border-line-strong`}
      />
    )
  }

  const cover = shots[0]
  const extra = shots.length - 1

  return (
    <div className={`relative ${box} ${ring} overflow-hidden rounded-field bg-line-soft`}>
      <button type="button" onClick={onOpen} className={`block h-full w-full ${CELL_FOCUS_RING}`}>
        {/* caption 默认空串、tag 常为 null,兜底到日期,否则读屏只念"按钮" */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover.image_url} alt={cover.caption || cover.tag || (dateKey === UNDATED_KEY ? t('undated') : dateKey)} className="h-full w-full object-cover" loading="lazy" />
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
  competitorId, shots, canEdit, onChanged, dateWindow, selectedDate,
}: {
  competitorId: string
  shots: CompetitorShot[]
  canEdit: boolean
  onChanged: () => void
  dateWindow: string[]
  selectedDate: string | null
}) {
  const t = useTranslations('competitors')
  const [openDate, setOpenDate] = useState<string | null>(null)
  const grouped = useMemo(() => groupShotsByDate(shots), [shots])

  // key:defaultDate 走的是 useState 初值器,只在挂载时跑一次。
  // 不重挂载的话,切换选中列后上传器仍停在旧日期,图会落到窗口外。
  const uploader = (
    <ShotUploader
      key={selectedDate ?? 'today'}
      competitorId={competitorId}
      onDone={onChanged}
      defaultDate={selectedDate}
    />
  )

  if (dateWindow.length === 0) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-ink-500">{t('noShots')}</p>
        {canEdit && <div className="flex justify-end">{uploader}</div>}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {canEdit && <div className="mb-2 flex justify-end">{uploader}</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${SHOT_WINDOW_SIZE}, minmax(0, 1fr))` }}>
        {dateWindow.map((d) => (
          <DateCell
            key={d}
            shots={grouped.get(d) ?? []}
            dateKey={d}
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
