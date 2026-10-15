'use client'

import { useEffect, useState } from 'react'
import { tokyoToday } from '@/lib/org/quadrant'

/**
 * 东京业务日「今天」（spec 2.2）。首屏用服务端算好的 initial，与 SSR 输出一致，不会水合错位；
 * 挂载后、标签页切回前台时、以及前台挂着每分钟各重算一次——标签页跨过东京零点后，
 * 紧急判定与截止日徽标当天就跟上。值没变时 setState 不触发重渲染。
 */
export function useTokyoToday(initial: string): string {
  const [today, setToday] = useState(initial)
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') setToday(tokyoToday())
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    // 前台一直开着跨零点（挂在副屏上）不会有 visibilitychange；电脑睡眠唤醒后也靠它在一分钟内补上
    const timer = window.setInterval(sync, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.clearInterval(timer)
    }
  }, [])
  return today
}
