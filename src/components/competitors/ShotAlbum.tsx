// src/components/competitors/ShotAlbum.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, X } from 'lucide-react'
import { weekStartOf } from '@/lib/competitors/weekly'
import ShotUploader from './ShotUploader'
import type { CompetitorShot } from '@/lib/competitors/types'
import { FOCUS_RING } from '@/lib/ui/recipes'

// 缩略图容器裁切（overflow-hidden）：offset 变体的 ring 会被裁掉一圈，两个
// 子按钮都改用 ring-inset（§4 第二配方①全出血容器），不导入 FOCUS_RING。
const THUMB_FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset'

function Thumb({ shot, canEdit, compact, onOpen, onDelete }: {
  shot: CompetitorShot
  canEdit: boolean
  compact: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const t = useTranslations('competitors')
  const label = [shot.shot_on, shot.tag].filter(Boolean).join(' · ')
  const box = compact
    ? 'h-32 w-[72px]'
    : 'h-[46vh] w-[26vh] min-h-[300px] min-w-[169px]'
  return (
    <div className={`relative ${box} shrink-0 overflow-hidden rounded-field bg-line-soft`}>
      <button type="button" onClick={onOpen} className={`block h-full w-full ${THUMB_FOCUS_RING}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.image_url} alt={shot.caption || shot.tag || ''} className="h-full w-full object-cover" loading="lazy" />
      </button>
      {label && (
        <span className={`pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-black/50 px-1 py-0.5 text-white ${compact ? 'text-[9px]' : 'inset-x-2 bottom-2 px-1.5 text-xs'}`}>{label}</span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('delete')}
          className={`absolute rounded bg-black/50 text-white hover:bg-danger-strong ${compact ? 'right-1 top-1 p-0.5' : 'right-2 top-2 p-1'} ${THUMB_FOCUS_RING}`}
        >
          <Trash2 size={compact ? 12 : 16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

export default function ShotAlbum({
  competitorId, shots, canEdit, onChanged, compact = false,
}: {
  competitorId: string
  shots: CompetitorShot[]
  canEdit: boolean
  onChanged: () => void
  compact?: boolean
}) {
  const t = useTranslations('competitors')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Esc 关闭全屏看图层，与 Modal/DiscussionPanel 的既有约定一致。
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  const removeShot = async (id: string) => {
    if (!confirm(t('deleteShotConfirm'))) return
    try {
      const res = await fetch(`/api/competitors/shots/${id}`, { method: 'DELETE' })
      if (res.ok) onChanged()
    } catch {
      // 忽略：失败时保留原状，用户可重试
    }
  }

  if (shots.length === 0 && !canEdit) {
    return <p className="text-xs text-ink-500">{t('noShots')}</p>
  }

  const foldedCount = compact ? 8 : 4
  const folded = shots.slice(0, foldedCount)

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
        <div className="flex flex-wrap gap-2">
          {folded.map((s) => (
            <Thumb key={s.id} shot={s} canEdit={canEdit} compact={compact} onOpen={() => setLightbox(s.image_url)} onDelete={() => removeShot(s.id)} />
          ))}
          {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} compact={compact} />}
        </div>
      ) : (
        <div className="space-y-3">
          {weekKeys.map((wk) => (
            <div key={wk}>
              <div className="mb-1 text-[11px] text-ink-500">{wk === '—' ? t('undated') : wk}</div>
              <div className="flex flex-wrap gap-2">
                {groups.get(wk)!.map((s) => (
                  <Thumb key={s.id} shot={s} canEdit={canEdit} compact={compact} onOpen={() => setLightbox(s.image_url)} onDelete={() => removeShot(s.id)} />
                ))}
              </div>
            </div>
          ))}
          {canEdit && <ShotUploader competitorId={competitorId} onDone={onChanged} compact={compact} />}
        </div>
      )}

      {shots.length > foldedCount && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`mt-2 rounded-field text-xs text-primary hover:text-primary-hover hover:underline ${FOCUS_RING}`}
        >
          {open ? t('collapse') : t('viewAll', { count: shots.length })}
        </button>
      )}

      {lightbox && (
        // 全屏看图层：保留 fixed inset-0 遮罩模式（不强迁 Modal——这是纯图片
        // 查看，没有 Modal 的标题栏/footer/表单语义），但壳体 token 化并补齐
        // z-index/关闭入口。z-[60] 而非原来的 z-50：§3 层级表把"移动端抽屉"
        // 登记在 50，这里是一个独立的全屏媒体查看器，语义上与 Modal 同层
        // （60），Tailwind 默认刻度不含 60，需方括号任意值写法（Modal.tsx
        // 同款写法）。原来只能点遮罩关闭、无键盘出口，补一个可聚焦的关闭
        // 按钮 + Esc（见上方 effect）满足 §6.2 可访问性底线。
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-card" />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label={tCommon('close')}
            className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-field bg-black/50 text-white transition-colors hover:bg-black/70 ${FOCUS_RING}`}
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  )
}
