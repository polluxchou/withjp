'use client'

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { lockViewportScroll } from '@/lib/ui/scrollLock'

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

  // 弹窗打开期间锁住底层页面滚动。遮罩盖满整屏但不吃滚轮，实测两种穿透都会复现：
  // 滚轮落在遮罩上时直接滚底层页面；落在面板里、而面板内容区当前不需要滚动时
  // （内容装得下），滚动会向上冒到视口，同样把底层页面滚走 —— 关掉弹窗才发现
  // 位置全变了。这与面板已声明的 aria-modal（向读屏宣告「外面是 inert」）自相矛盾。
  //
  // 锁的是 <html> 而不是 body,理由与验证方法见 lib/ui/scrollLock.ts 的注释。
  useEffect(() => {
    if (!open) return
    return lockViewportScroll()
  }, [open])

  // 基础焦点圈定（design-system §6.2 可访问性底线）：打开时记下触发前的
  // 焦点元素并把焦点挪进面板本身（面板加 tabIndex={-1} 使其可编程聚焦，
  // 不出现在 Tab 序列里）；effect 的清理函数在 open 变 false 或组件卸载时
  // 运行，把焦点还给触发元素——覆盖 Escape、遮罩点击、父组件外部关闭等
  // 所有关闭路径，而不必在每个关闭入口分别处理。
  //
  // 依赖数组必须带上 mounted：这个组件的门面渲染是 `!open || !mounted` 才
  // return null，也就是说父组件如果一上来就用 open=true 挂载（不是先
  // open=false 再切 true），首次渲染时 mounted 还是 false，组件整体返回
  // null——panelRef 根本没挂到真实 DOM 上。此时这个 effect 仍会因为 open
  // 依赖首次出现而跑一次，但 `panelRef.current` 是 null，`.focus()` 静默
  // 空跑。随后 mounted 变 true 触发第二次渲染，面板真正出现，但 open 这个
  // 依赖值并没有变化（一直是 true），effect 不会重新执行，焦点从此再也
  // 进不去面板。只依赖 open 抓不住"面板从无到有"这个时机，必须把 mounted
  // 也列进依赖——mounted 从 false 变 true 本身就是一次有效的重新触发。
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [open, mounted])

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
    // 打开瞬间焦点落在面板本身（tabIndex=-1，不是 first）——这时如果用户
    // 直接按 Shift+Tab，activeElement 既不是 first 也不是 last，两个分支
    // 都不命中，会被浏览器原生行为送到面板"之前"的可聚焦元素，直接逃出
    // 面板。把 panelRef.current 并入 Shift+Tab 的命中条件，让"焦点还停在
    // 面板本身"和"焦点在 first"视为同一种边界状态，一起回绕到 last。
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
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
        // 全站唯一一处「focus:outline-none 不配 ring」的合法例外（§4）：
        // tabIndex={-1} 的面板只作打开时的程序化焦点落点，用户 Tab 不会停在
        // 它上面，画一圈 ring 反而会在弹窗打开瞬间闪出一整框轮廓。面板内的
        // 真正可聚焦控件各自带标准 focus 环。
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
