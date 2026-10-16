'use client'

import { useEffect } from 'react'
import { resolveVenueShortcut, type VenueShortcut } from '@/lib/venue/editor'

// 输入框/下拉/可编辑区域里的按键留给它们自己(复制粘贴文字、退格删字)。
function isUndoTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true
  const tag = target.tagName.toLowerCase()
  return !target.isContentEditable && tag !== 'input' && tag !== 'textarea' && tag !== 'select'
}

// 画布快捷键:Delete/Backspace 删除、⌘C/⌘V/⌘D 复制粘贴再制、⌘Z/⇧⌘Z/⌘Y 撤销重做。
// 不带依赖数组:每次渲染重新挂监听,处理函数总是拿到当前渲染的状态。
export function useVenueShortcuts({
  hasSelection,
  hasClipboard,
  handlers,
}: {
  hasSelection: boolean
  hasClipboard: boolean
  handlers: Record<VenueShortcut, () => void>
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isUndoTarget(event.target)) return
      const action = resolveVenueShortcut(event, { hasSelection, hasClipboard })
      if (!action) return
      event.preventDefault()
      handlers[action]()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })
}
