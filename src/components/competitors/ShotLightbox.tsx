// src/components/competitors/ShotLightbox.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import type { CompetitorShot } from '@/lib/competitors/types'

export default function ShotLightbox({
  shots, canEdit, onClose, onChanged,
}: {
  shots: CompetitorShot[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const t = useTranslations('competitors')
  const [index, setIndex] = useState(0)
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const current = shots[index]

  useEffect(() => {
    setDateInput(current?.shot_on ?? '')
    setError(null)
  }, [current])

  useEffect(() => {
    if (shots.length && index > shots.length - 1) setIndex(shots.length - 1)
  }, [shots.length, index])

  if (!current) return null

  const saveDate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_on: dateInput || null }),
      })
      if (!res.ok) { setError(t('shotDateInvalid')); return }
      onChanged()
      onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const removeCurrent = async () => {
    if (!confirm(t('deleteShotConfirm'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/competitors/shots/${current.id}`, { method: 'DELETE' })
      if (!res.ok) { setError(t('actionFailed')); return }
      onChanged()
      onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[80vh] items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          aria-label={t('prevShot')}
          className="rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.image_url} alt={current.caption || current.tag || ''} className="max-h-[80vh] max-w-full rounded-lg" />
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, shots.length - 1))}
          disabled={index >= shots.length - 1}
          aria-label={t('nextShot')}
          className="rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-white" onClick={(e) => e.stopPropagation()}>
        <span>{t('shotIndexOf', { index: index + 1, total: shots.length })}</span>
        {canEdit && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('shotDate')}</span>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="rounded border border-line px-1.5 py-0.5 text-ink-900"
              />
            </label>
            <button
              type="button"
              onClick={saveDate}
              disabled={busy}
              className="rounded bg-primary px-2 py-1 text-white disabled:opacity-50"
            >
              {t('saveShotDate')}
            </button>
            <button
              type="button"
              onClick={removeCurrent}
              disabled={busy}
              aria-label={t('delete')}
              className="rounded bg-black/50 p-1 text-white hover:bg-danger-strong disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label={t('closeShot')} className="rounded bg-black/50 p-1 text-white">
          <X size={14} />
        </button>
      </div>

      {error && <p className="text-xs text-white">{error}</p>}
    </div>
  )
}
