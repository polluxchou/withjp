'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Plus } from 'lucide-react'
import { FOCUS_RING } from '@/lib/ui/recipes'

export default function AddAccountMenu({
  onAddTemplate,
  onAddBlank,
}: {
  onAddTemplate: () => void
  onAddBlank: () => void
}) {
  const t = useTranslations('financeForecast')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => { onAddTemplate(); setOpen(false) }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-field bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('addFromTemplate')}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('ariaAddAccountMenu')}
        className={`inline-flex items-center px-1.5 py-1.5 rounded-r-field bg-primary text-white border-l border-primary-hover hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
      >
        <ChevronDown aria-hidden className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="menu"
          // z-40 = §3 层级表的「下拉/popover」档（原来的 z-20 不在表内）
          className="absolute right-0 top-full mt-1 z-40 min-w-[10rem] bg-surface border border-line rounded-card shadow-pop overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { onAddTemplate(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-700 hover:bg-line-soft text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
          >
            <Plus className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} /> {t('addFromTemplate')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onAddBlank(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-700 hover:bg-line-soft text-left border-t border-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
          >
            <Plus className="w-3.5 h-3.5 text-ink-400" strokeWidth={1.5} /> {t('addBlank')}
          </button>
        </div>
      )}
    </div>
  )
}
