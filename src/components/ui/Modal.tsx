'use client'

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
  footer?: ReactNode
}

const FOCUSABLE_SELECTOR = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, children, width = 'max-w-lg', footer }: ModalProps) {
  const tCommon = useTranslations('common')
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
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

  // 基础焦点圈定（design-system §6.2 可访问性底线）：打开时记下触发前的
  // 焦点元素并把焦点挪进面板本身（面板加 tabIndex={-1} 使其可编程聚焦，
  // 不出现在 Tab 序列里）；effect 的清理函数在 open 变 false 或组件卸载时
  // 运行，把焦点还给触发元素——覆盖 Escape、遮罩点击、父组件外部关闭等
  // 所有关闭路径，而不必在每个关闭入口分别处理。
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Tab 循环：只在面板内部的可聚焦元素间打转，不允许 Tab 出面板边界回到
  // 页面背后的内容（原生浏览器行为默认会这样，需要手动拦截）。
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!open || !mounted) return null

  const content = (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative bg-white shadow-pop w-full ${width} max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-card sm:rounded-card focus:outline-none`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-line-soft">
          <h2 id={titleId} className="min-w-0 line-clamp-2 text-xl font-semibold text-ink-900 tracking-title">{title}</h2>
          <button
            type="button"
            aria-label={tCommon('close')}
            onClick={onClose}
            className="flex-none -mr-1 w-9 h-9 rounded-field flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-4 sm:px-6 py-3.5 border-t border-line-soft">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
