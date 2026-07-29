// src/components/competitors/ShotAlbum.tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { weekStartOf } from '@/lib/competitors/weekly'
import ShotUploader from './ShotUploader'
import type { CompetitorShot } from '@/lib/competitors/types'

function Thumb({ shot, onOpen }: { shot: CompetitorShot; onOpen: () => void }) {
  const label = [shot.shot_on, shot.tag].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative h-[132px] w-[74px] shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.image_url} alt={shot.caption || shot.tag || ''} className="h-full w-full object-cover" loading="lazy" />
      {label && (
        <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/50 px-1 py-0.5 text-[9px] text-white">{label}</span>
      )}
    </button>
  )
}

export default function ShotAlbum({
  competitorId, shots, canEdit, onChanged,
}: {
  competitorId: string
  shots: CompetitorShot[]
  canEdit: boolean
  onChanged: () => void
}) {
  const t = useTranslations('competitors')
  const [open, setOpen] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (shots.length === 0 && !canEdit) {
    return <p className="text-xs text-neutral-500">{t('noShots')}</p>
  }

  const folded = shots.slice(0, 6)

  const groups = new Map<string, CompetitorShot[]>()
  for (const s of shots) {
    const key = s.shot_on ? weekStartOf(s.shot_on) : '—'
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }
  const weekKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === '—') return 1
    if (b === '—') return -1
    return b.localeCompare(a)
  })

  return (
    <div className="min-w-0">
      {!open ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {folded.map((s) => <Thumb key={s.id} shot={s} onOpen={() => setLightbox(s.image_url)} />)}
          {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} />}
        </div>
      ) : (
        <div className="space-y-3">
          {weekKeys.map((wk) => (
            <div key={wk}>
              <div className="mb-1 text-[11px] text-neutral-500">{wk === '—' ? t('undated') : wk}</div>
              <div className="flex flex-wrap gap-2">
                {groups.get(wk)!.map((s) => <Thumb key={s.id} shot={s} onOpen={() => setLightbox(s.image_url)} />)}
              </div>
            </div>
          ))}
          {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} />}
        </div>
      )}

      {shots.length > 6 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs text-sky-600 hover:underline dark:text-sky-400"
        >
          {open ? t('collapse') : t('viewAll', { count: shots.length })}
        </button>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
