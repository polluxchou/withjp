'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}

export default function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  const tCommon = useTranslations('common')
  // Portal to document.body so a `position: fixed` modal always escapes any
  // ancestor that creates a containing block via transform / filter / etc.
  // The mobile sidebar uses translate-x for its drawer animation; without
  // the portal, modals rendered inside it get visually clipped to the
  // sidebar's box.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || !mounted) return null

  const content = (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative bg-white shadow-pop w-full ${width} max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-card sm:rounded-card`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-line-soft">
          <h2 className="text-xl font-semibold text-ink-900 tracking-title">{title}</h2>
          <button
            type="button"
            aria-label={tCommon('close')}
            onClick={onClose}
            className="-mr-1 w-9 h-9 rounded-field flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4">{children}</div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
