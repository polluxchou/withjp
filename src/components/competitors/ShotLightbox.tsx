// src/components/competitors/ShotLightbox.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import type { CompetitorShot } from '@/lib/competitors/types'
import { todayLocal } from '@/lib/competitors/localDate'
import { LIGHTBOX_VISIBLE, clampWindowStart } from '@/lib/competitors/shotGrid'

export default function ShotLightbox({
  shots, canEdit, onClose, onChanged,
}: {
  shots: CompetitorShot[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('competitors')
  const [start, setStart] = useState(0)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 渲染期夹逼,不放 useEffect:effect 版本在 shots 变短时会先渲染出
  // 越界的一帧(整个灯箱闪掉),effect 跑完才回来。
  const from = clampWindowStart(start, shots.length, LIGHTBOX_VISIBLE)
  const visible = shots.slice(from, from + LIGHTBOX_VISIBLE)

  // 兜底到窗口首张,一次覆盖"选中项被删"与"选中项滑出窗口"两种情况。
  // 删除不可逆,作用对象必须永远在画面里。
  const selected = visible.find((s) => s.id === pickedId) ?? visible[0]

  // 依赖两个原始值而不是 selected 对象本身:调用方每次渲染换引用也不会重复触发,
  // 同时满足 exhaustive-deps(依赖数组不参与类型检查,靠 lint 兜底,别写成对象)。
  const selectedId = selected?.id
  const selectedShotOn = selected?.shot_on ?? ''

  useEffect(() => {
    setDateInput(selectedShotOn)
    setError(null)
  }, [selectedId, selectedShotOn])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!selected) return null

  const atStart = from <= 0
  const atEnd = from + LIGHTBOX_VISIBLE >= shots.length
  const selectedIndex = shots.findIndex((s) => s.id === selected.id)

  // 箭头既翻窗口也换选中:选中新进来的那一张,读作"看下一张",
  // 与改版前单图模式的心智模型一致。
  const step = (direction: -1 | 1) => {
    const next = clampWindowStart(from + direction, shots.length, LIGHTBOX_VISIBLE)
    const win = shots.slice(next, next + LIGHTBOX_VISIBLE)
    const pick = direction === 1 ? win[win.length - 1] : win[0]
    setStart(next)
    if (pick) setPickedId(pick.id)
  }

  const saveDate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_on: dateInput || null }),
      })
      // 只有 400 才是日期本身的问题;401/500 也说成"日期格式不对"
      // 会让人反复重打一个根本没错的日期
      if (!res.ok) { setError(res.status === 400 ? t('shotDateInvalid') : t('actionFailed')); return }
      await onChanged()
      onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async () => {
    if (!confirm(t('deleteShotConfirm'))) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${selected.id}`, { method: 'DELETE' })
      if (!res.ok) { setError(t('actionFailed')); return }
      await onChanged()
      // 只在删掉最后一张时才关。否则清理某天的多张图要"开→删→关→再开"
      // 循环一遍;留着不关的话,refetch 后 shots 变短、窗口与选中都会自动夹逼兜底。
      if (shots.length <= 1) onClose()
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
      aria-label={selected.shot_on ?? t('undated')}
    >
      {/*
        不写 aria-modal:本仓约定是没有 focus trap 就不许声明它
        (见 tasks/page.tsx 的同款注释),否则等于骗读屏说外面已经 inert。
        全套 focus trap 在 components/ui/Modal.tsx,这里用不上,Esc 关闭已够。
      */}
      <div className="flex max-h-[80vh] items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label={t('prevShot')}
          className="shrink-0 rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        {/*
          并排最多 LIGHTBOX_VISIBLE 张。当天不足这么多就有几张排几张——
          父层是 flex-col,横向居中由 items-center(交叉轴)负责,所以不足 3 张时
          这一行会自然居中,不需要占位空格。
          min-w-0 是为了极窄视口下等比缩小而不是横向溢出。
        */}
        {visible.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setPickedId(s.id)}
            aria-pressed={s.id === selected.id}
            aria-label={s.caption || s.tag || s.shot_on || t('undated')}
            className={`min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
              s.id === selected.id ? 'ring-2 ring-primary' : ''
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.image_url}
              alt={s.caption || s.tag || ''}
              className="max-h-[64vh] max-w-full rounded-lg"
            />
          </button>
        ))}
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atEnd}
          aria-label={t('nextShot')}
          className="shrink-0 rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-white" onClick={(e) => e.stopPropagation()}>
        <span>{t('shotIndexOf', { index: selectedIndex + 1, total: shots.length })}</span>
        {canEdit && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('shotDate')}</span>
              <input
                type="date"
                value={dateInput}
                max={todayLocal()}
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
              onClick={removeSelected}
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
