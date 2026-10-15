'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  NEW_NOTICE_CLOCK, clockLeft, isEditableTarget, isUndoShortcut, pauseClock, resumeClock, undoShortcutLabel,
} from '@/lib/org/dropNotice'

/**
 * 拖放后的提示条（spec 4.2）：5 秒后自动消失；有旧值时提供「撤销」。onDismiss 须是稳定引用。
 *
 * - 鼠标悬停或焦点在条内时暂停计时，离开后按剩余时间继续（WCAG 2.2.1）。
 * - suspended（又开始拖动）时隐藏并冻结计时：拖动取消后原样回来，撤销仍可用；拖完放下则由新提示替换。
 * - 提示条在 DOM 末尾，键盘用户 5 秒内 Tab 不到「撤销」，所以显示期间 Ctrl+Z / ⌘Z 直接撤销（shortcut 为 false 时不接管，
 *   例如有对话框开着）。
 * - 这里不播报：读屏的唯一播报在 QuadrantView 常驻的 live region 里。
 */
export default function DropNotice({ message, canUndo, suspended, shortcut, onUndo, onDismiss }: {
  message: string
  canUndo: boolean
  suspended: boolean
  shortcut: boolean
  onUndo: () => void
  onDismiss: () => void
}) {
  const t = useTranslations('team')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const clock = useRef(NEW_NOTICE_CLOCK)
  const paused = suspended || hovered || focused

  useEffect(() => {
    const now = performance.now()
    if (paused) {
      clock.current = pauseClock(clock.current, now)
      return
    }
    clock.current = resumeClock(clock.current, now)
    const timer = window.setTimeout(onDismiss, clockLeft(clock.current, now))
    return () => window.clearTimeout(timer)
  }, [paused, onDismiss])

  // 隐藏时元素下的悬停不会再收到 pointerleave，回来后可能卡在「悬停中」永远不走；隐藏即视为离开。
  useEffect(() => {
    if (suspended) setHovered(false)
  }, [suspended])

  const undoByKey = canUndo && shortcut && !suspended
  useEffect(() => {
    if (!undoByKey) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isUndoShortcut(e) || isEditableTarget(e.target)) return
      e.preventDefault()
      onUndo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undoByKey, onUndo])

  // 只在客户端拖放后才挂载，读 navigator 不会造成水合不一致。
  const keyLabel = undoShortcutLabel(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '',
  )

  return (
    <div className={`pointer-events-none fixed inset-x-0 bottom-6 z-40 justify-center px-4 ${suspended ? 'hidden' : 'flex'}`}>
      <div
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHovered(true) }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHovered(false) }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}
        className="pointer-events-auto flex max-w-md items-center gap-3 rounded-card bg-ink-900 py-1.5 pl-4 pr-2 text-sm text-surface shadow-pop"
      >
        <span className="min-w-0">{message}</span>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            aria-keyshortcuts="Control+Z Meta+Z"
            className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-field px-3 font-semibold text-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            <span className="underline underline-offset-2">{t('org.undo')}</span>
            <kbd aria-hidden className="hidden font-sans text-xs font-normal text-ink-400 md:inline">{keyLabel}</kbd>
          </button>
        )}
      </div>
    </div>
  )
}
