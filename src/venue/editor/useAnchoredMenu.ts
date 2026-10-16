'use client'

import { useEffect, useRef, useState } from 'react'

// 工具栏下拉菜单(添加/标尺/筛选/视角书签)共用的开合逻辑:
// 点外面关闭;菜单用 fixed 坐标锚在触发按钮下方。
export function useAnchoredMenu() {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handle = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // The toolbar is horizontally scrollable, which clips an absolutely-positioned
  // menu — anchor it with fixed coords from the trigger so it escapes the clip.
  const toggleOpen = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
    setOpen((value) => !value)
  }

  return { open, setOpen, menuPos, ref, buttonRef, toggleOpen }
}
