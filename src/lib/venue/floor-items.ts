// 场地布置页的列表/汇总纯逻辑：从 guild-venue/page.tsx 原样抽出,行为不变。
// 值 import 走相对路径带 .ts(node --test 不解析 @/ 别名);纯类型 import 可用别名。
import { isVenueMarkerType, venueAreaSquareMeters } from '../../venue/layoutData.ts'
import type { Item } from '@/lib/items/types'
import type { Expense } from '@/lib/types'
import type { VenueFloor, VenueItem, VenueItemType } from '@/venue/layoutData'

// ── 物品联动(物品模块 × 支出管理)─────────────────────────────────────────────

export type PlacedItemCost = {
  id: string
  item_code: string
  name: string
  quantity: number
  cost: number
}

// 楼层物品行:多带所在区域名,行上可写「直播间 A → 摄像机」。
// zoneName 为 null 表示物品还没落到任何区域。
export type FloorItemCost = PlacedItemCost & { zoneName: string | null }

// 单价 × 数量;没关联支出(或看不到支出)按 0 计。
function itemCost(item: Item, expenseById: Record<string, Expense>): number {
  const ex = item.expense_id ? expenseById[item.expense_id] : null
  return ex ? Number(ex.unit_price) * item.quantity : 0
}

// 放在选中区域里的物品。没有选中区域时为空。
export function buildPlacedItems(
  items: Item[],
  expenseById: Record<string, Expense>,
  zone: Pick<VenueItem, 'id'> | null,
): PlacedItemCost[] {
  if (!zone) return []
  return items
    .filter((it) => it.placement_venue_item_id === zone.id)
    .map((it) => ({ id: it.id, item_code: it.item_code, name: it.name, quantity: it.quantity, cost: itemCost(it, expenseById) }))
}

// Floor-level rollup: every item whose placement_venue_item_id lands on any
// venue item in the active floor, so the operator can see everything the floor
// owns without selecting a zone.
export function buildFloorItems(
  items: Item[],
  expenseById: Record<string, Expense>,
  floor: Pick<VenueFloor, 'items'> | undefined,
): FloorItemCost[] {
  if (!floor) return []
  const venueItemById = new Map(floor.items.map((it) => [it.id, it]))
  return items
    .filter((it) => it.placement_venue_item_id && venueItemById.has(it.placement_venue_item_id))
    .map((it) => {
      const zone = venueItemById.get(it.placement_venue_item_id!) ?? null
      return {
        id: it.id,
        item_code: it.item_code,
        name: it.name,
        quantity: it.quantity,
        cost: itemCost(it, expenseById),
        zoneName: zone?.name ?? null,
      }
    })
}

export function sumItemCost(list: { cost: number }[]): number {
  return list.reduce((sum, p) => sum + p.cost, 0)
}

// ── 浮动面板的组件清单 ───────────────────────────────────────────────────────

export type VenueListTab = 'shapes' | 'markers' | 'items'

// corridor renders as a shape but is grouped under the "标识" tab
export function isInMarkersTab(type: VenueItemType): boolean {
  return isVenueMarkerType(type) || type === 'corridor'
}

export function countListTabs(items: VenueItem[]): { markerCount: number; shapeCount: number } {
  const markerCount = items.filter((item) => isInMarkersTab(item.type)).length
  return { markerCount, shapeCount: items.length - markerCount }
}

// 当前分页 + 类型筛选下的组件,按面积从大到小。
export function listTabItems(items: VenueItem[], visibleTypes: Set<VenueItemType>, tab: VenueListTab): VenueItem[] {
  return items
    .filter((item) => visibleTypes.has(item.type))
    .filter((item) => (tab === 'markers' ? isInMarkersTab(item.type) : !isInMarkersTab(item.type)))
    .sort((a, b) => venueAreaSquareMeters(b) - venueAreaSquareMeters(a))
}

// Rank the three largest 'area' spaces (by area share) — computed over all
// items so the badge stays stable regardless of the active type filter.
export function topAreaRank(items: VenueItem[]): Map<string, number> {
  const map = new Map<string, number>()
  items
    .filter((item) => item.type === 'area')
    .sort((a, b) => venueAreaSquareMeters(b) - venueAreaSquareMeters(a))
    .slice(0, 3)
    .forEach((item, index) => map.set(item.id, index))
  return map
}

// ── 协作者 ──────────────────────────────────────────────────────────────────

// 按姓名或邮箱模糊匹配(忽略大小写与首尾空白);空查询返回原数组。
export function filterCollaborators<T extends { name: string; email: string | null }>(users: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
    : users
}
