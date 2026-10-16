'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Item } from '@/lib/items/types'
import type { Expense } from '@/lib/types'
import type { VenueFloor, VenueItem } from '@/venue/layoutData'
import { buildFloorItems, buildPlacedItems, sumItemCost } from '@/lib/venue/floor-items'

// Cross-feature read: surface the items placed in the selected zone (and on the
// whole floor) + their summed cost. Failure to load is non-fatal (the canvas
// still works).
export function useVenueItemCosts(activeFloor: VenueFloor | undefined, selectedItem: VenueItem | null) {
  const [items, setItems] = useState<Item[]>([])
  const [expenseById, setExpenseById] = useState<Record<string, Expense>>({})
  // 支出管理仅管理员可访问：非管理员拿不到支出列表（/api/expenses 回 403），
  // 这时金额一律不显示，而不是把每件物品都显示成 ¥0。
  const [costsVisible, setCostsVisible] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [itemsRes, exRes] = await Promise.all([fetch('/api/items'), fetch('/api/expenses')])
        const itemsJson = await itemsRes.json()
        const exJson = await exRes.json()
        if (itemsJson?.data) setItems(itemsJson.data as Item[])
        if (exJson?.data) {
          const map: Record<string, Expense> = {}
          for (const e of exJson.data as Expense[]) map[e.id] = e
          setExpenseById(map)
          setCostsVisible(true)
        }
      } catch { /* 联动展示是增强项，失败不阻断画布 */ }
    })()
  }, [])

  const placedItems = useMemo(
    () => buildPlacedItems(items, expenseById, selectedItem),
    [items, expenseById, selectedItem],
  )
  const placedItemsTotalCost = useMemo(() => sumItemCost(placedItems), [placedItems])

  // Floor-level rollup used by the FloatingPanel "物品" tab.
  const floorItems = useMemo(
    () => buildFloorItems(items, expenseById, activeFloor),
    [items, expenseById, activeFloor],
  )
  const floorItemsTotalCost = useMemo(() => sumItemCost(floorItems), [floorItems])

  return { placedItems, placedItemsTotalCost, floorItems, floorItemsTotalCost, costsVisible }
}
