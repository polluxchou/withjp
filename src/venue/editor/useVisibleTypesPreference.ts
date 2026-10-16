'use client'

import { useEffect, useRef, useState } from 'react'
import type { VenueItemType } from '@/venue/layoutData'
import { parseVisibleTypes } from '@/lib/venue/editor'
import { ALL_VENUE_TYPES } from './toolCatalog'

// 画布类型筛选(哪些组件类型显示)持久化,切换语言(整页导航)后不丢失。
const VISIBLE_TYPES_KEY = 'guild-venue:visible-types'

export function useVisibleTypesPreference() {
  const [visibleTypes, setVisibleTypes] = useState<VenueItemType[]>(ALL_VENUE_TYPES)
  // 挂载时从 localStorage 恢复筛选(与当前有效类型取交集,过滤已废弃类型);
  // 用 effect 恢复以避免 SSR/hydration 不一致。切换语言=整页导航后筛选得以保留。
  useEffect(() => {
    try {
      const restored = parseVisibleTypes(window.localStorage.getItem(VISIBLE_TYPES_KEY), ALL_VENUE_TYPES)
      if (restored) setVisibleTypes(restored)
    } catch {
      // localStorage 不可读/脏数据 → 用默认全部,静默跳过。
    }
  }, [])
  // 筛选变更后写回。跳过挂载后的首次运行,避免用默认值覆盖刚恢复的筛选。
  const skipFirstFilterSave = useRef(true)
  useEffect(() => {
    if (skipFirstFilterSave.current) {
      skipFirstFilterSave.current = false
      return
    }
    try {
      window.localStorage.setItem(VISIBLE_TYPES_KEY, JSON.stringify(visibleTypes))
    } catch {
      // 忽略写入失败。
    }
  }, [visibleTypes])

  return [visibleTypes, setVisibleTypes] as const
}
