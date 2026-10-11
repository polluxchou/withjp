// src/components/competitors/live/useScrollFade.ts
'use client'

import { useEffect, useState } from 'react'
import { hiddenRight } from '@/lib/competitors/liveBoard'

/**
 * 横向滚动的图卡片要不要画右缘渐隐：内容比容器宽、且右边还有没滚到的列时为 true（判据在 liveBoard.hiddenRight）。
 *
 * 返回的 ref 是回调 ref（useState 的 setter）：国家月历在没有国家时提前返回、不渲染滚动容器，
 * 容器之后才出现时 effect 要能重新挂上，固定的 useRef + 空依赖做不到。
 * 量两样东西的尺寸：容器（窗口变宽变窄、侧栏收起）与里层内容（换国家 / 翻到 30 天的月份，内容宽度会变），
 * 再听 scroll（滚到底渐隐要撤掉）。
 */
export function useScrollFade<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [fade, setFade] = useState(false)

  useEffect(() => {
    if (!el) return
    const measure = () => setFade(hiddenRight(el))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [el])

  return { ref: setEl, fade }
}
