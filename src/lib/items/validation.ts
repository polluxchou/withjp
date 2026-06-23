import { ITEM_KINDS, ITEM_STATUSES, type ItemKind, type ItemStatus } from './types.ts'

export interface EffectiveItem {
  name: string
  kind: ItemKind
  expense_id: string | null
  placement_venue_item_id: string | null
  quantity: number
  status: ItemStatus
}

export function validateItem(item: EffectiveItem): string | null {
  if (!item.name || !item.name.trim()) return '物品名称不能为空'
  if (!(ITEM_KINDS as string[]).includes(item.kind)) return '物品类型无效'
  if (!(ITEM_STATUSES as string[]).includes(item.status)) return '物品状态无效'
  if (!Number.isFinite(item.quantity) || item.quantity < 1) return '数量必须 ≥ 1'

  if (item.kind === 'physical') {
    if (!item.expense_id) return '实物必须关联一个成本（支出记录）'
    if (!item.placement_venue_item_id) return '实物必须关联一个放置位置'
  } else {
    if (item.placement_venue_item_id) return '虚拟商品不能有放置位置'
  }
  return null
}
