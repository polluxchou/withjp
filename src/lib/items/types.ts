export type ItemKind = 'physical' | 'virtual'
export type ItemStatus = 'in_use' | 'in_storage' | 'under_repair' | 'disposed'

export const ITEM_KINDS: ItemKind[] = ['physical', 'virtual']
export const ITEM_STATUSES: ItemStatus[] = ['in_use', 'in_storage', 'under_repair', 'disposed']

export interface Item {
  id: string
  item_code: string
  name: string
  kind: ItemKind
  expense_id: string | null
  placement_venue_item_id: string | null
  quantity: number
  item_value: number | null
  status: ItemStatus
  responsible_person: string | null
  serial_number: string | null
  photo_url: string | null
  notes: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface ItemStatusLog {
  id: string
  item_id: string
  from_status: ItemStatus | null
  to_status: ItemStatus
  note: string | null
  changed_by_user_id: string | null
  changed_at: string
}

export interface ItemWithLogs extends Item {
  status_logs: ItemStatusLog[]
}
