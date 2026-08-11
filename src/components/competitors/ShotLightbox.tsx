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

  // 渲染期夹逼,不放 useEffect:effect 版本在 shots 变短时会先渲染出
  // current === undefined 的一帧(整个灯箱闪掉),effect 跑完才回来。
  const idx = Math.min(index, Math.max(shots.length - 1, 0))
  const current = shots[idx]

  // 依赖 id 而不是对象本身,这样不依赖调用方有没有把 shots 记忆化
  useEffect(() => {
    setDateInput(current?.shot_on ?? '')
    setError(null)
  }, [current?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
      // 只有 400 才是日期本身的问题;401/500 也说成"日期格式不对"
      // 会让人反复重打一个根本没错的日期
      if (!res.ok) { setError(res.status === 400 ? t('shotDateInvalid') : t('actionFailed')); return }
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
    setError(null)
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
      aria-label={current.shot_on ?? t('undated')}
    >
      {/*
        不写 aria-modal:本仓约定是没有 focus trap 就不许声明它
        (见 tasks/page.tsx 的同款注释),否则等于骗读屏说外面已经 inert。
        全套 focus trap 在 components/ui/Modal.tsx,这里用不上,Esc 关闭已够。
      */}
      <div className="flex max-h-[80vh] items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setIndex(Math.max(idx - 1, 0))}
          disabled={idx === 0}
          aria-label={t('prevShot')}
          className="rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.image_url} alt={current.caption || current.tag || ''} className="max-h-[80vh] max-w-full rounded-lg" />
        <button
          type="button"
          onClick={() => setIndex(Math.min(idx + 1, shots.length - 1))}
          disabled={idx >= shots.length - 1}
          aria-label={t('nextShot')}
          className="rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-white" onClick={(e) => e.stopPropagation()}>
        <span>{t('shotIndexOf', { index: idx + 1, total: shots.length })}</span>
        {canEdit && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('shotDate')}</span>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="rounded border border-line-strong px-1.5 py-0.5 text-ink-900"
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

      {error && (
        <p
          role="status"
          onClick={(e) => e.stopPropagation()}
          className="rounded bg-danger-strong px-2 py-1 text-xs text-white"
        >
          {error}
        </p>
      )}
    </div>
  )
}
