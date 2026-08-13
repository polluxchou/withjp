// src/components/competitors/ShotAlbum.tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { SHOT_WINDOW_SIZE, UNDATED_KEY, groupShotsByDate } from '@/lib/competitors/shotGrid'
import { imageFromClipboard, uploadShot } from '@/lib/competitors/uploadShot'
import ShotUploader from './ShotUploader'
import ShotLightbox from './ShotLightbox'
import type { CompetitorShot } from '@/lib/competitors/types'

// 格子是 overflow-hidden 的全出血容器，FOCUS_RING 的 offset 变体会被裁掉一圈，
// 按 §4 第二配方①改用 ring-inset，故不导入 FOCUS_RING。
const CELL_FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset'

// 宽度由网格决定,高度交给比例。旧缩略图 h-[46vh] w-[26vh] 两维都绑 vh,比例恒为
// 9:16 其实不裁;只留高度那一半会让竖屏截图被 object-cover 横向裁掉近一半。
const BOX = 'aspect-[9/16]'

/**
 * 空格子。canEdit 时它就是那一天的补图入口：点 + 选文件，或聚焦后直接 Ctrl+V。
 *
 * 位置刻意放在格子里而不是行尾——日期由所在列决定，不会填错；而且入口就在
 * 用户正看着"这天缺图"的地方。旧版是行尾一个大虚线框，改成日期网格后那个位置
 * 被日期列占了，粘贴入口一度整个消失。
 */
function EmptyCell({ competitorId, dateKey, canEdit, onChanged, ring }: {
  competitorId: string
  dateKey: string
  canEdit: boolean
  onChanged: () => void
  ring: string
}) {
  const t = useTranslations('competitors')
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const undated = dateKey === UNDATED_KEY
  const emptyLabel = undated ? t('noShotUndated') : t('noShotOnDate', { date: dateKey })
  const shell = `${BOX} ${ring} rounded-field border border-dashed border-line-strong`

  // 无日期列不给补图入口：往那儿新建一张"没有日期"的截图没有意义
  if (!canEdit || undated) {
    return <div role="img" aria-label={emptyLabel} className={shell} />
  }

  const send = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const failed = await uploadShot(competitorId, file, dateKey)
      if (failed) { setError(t('uploadFailed')); return }
      onChanged()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        if (busy) return
        const file = imageFromClipboard(e.clipboardData?.items)
        if (file) { e.preventDefault(); send(file) }
      }}
      aria-label={t('addShotOnDate', { date: dateKey })}
      className={`${shell} flex flex-col items-center justify-center gap-1 text-ink-400 focus-within:border-primary-border ${CELL_FOCUS_RING}`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={t('addShotOnDate', { date: dateKey })}
        className={`rounded-field p-1 hover:text-ink-700 disabled:opacity-50 ${CELL_FOCUS_RING}`}
      >
        <Plus size={20} strokeWidth={1.5} />
      </button>
      <span className="px-1 text-center text-[10px] leading-tight">{t('orPaste')}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = '' }}
      />
      {error && <span className="px-1 text-center text-[10px] text-danger-text">{error}</span>}
    </div>
  )
}

function FilledCell({ shots, dateKey, ring, onOpen }: {
  shots: CompetitorShot[]
  dateKey: string
  ring: string
  onOpen: () => void
}) {
  const t = useTranslations('competitors')
  const cover = shots[0]
  const extra = shots.length - 1

  return (
    <div className={`relative ${BOX} ${ring} overflow-hidden rounded-field bg-line-soft`}>
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

  if (dateWindow.length === 0) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-ink-500">{t('noShots')}</p>
        {canEdit && (
          <div className="flex justify-end">
            <ShotUploader competitorId={competitorId} onDone={onChanged} />
          </div>
        )}
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
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${SHOT_WINDOW_SIZE}, minmax(0, 1fr))` }}>
        {dateWindow.map((d) => {
          const dayShots = grouped.get(d) ?? []
          // 描边两个分支都要:一列里空格子越多,越需要它告诉你看的是同一天
          const ring = d === selectedDate ? 'ring-2 ring-primary' : ''
          return dayShots.length
            ? <FilledCell key={d} shots={dayShots} dateKey={d} ring={ring} onOpen={() => setOpenDate(d)} />
            : <EmptyCell key={d} competitorId={competitorId} dateKey={d} canEdit={canEdit} onChanged={onChanged} ring={ring} />
        })}
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
