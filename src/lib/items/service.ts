import { createServerClient } from '@/lib/supabase/server'
import { validateItem } from '@/lib/items/validation'
import { ITEM_STATUSES } from '@/lib/items/types'
import type { Item, ItemKind, ItemStatus, ItemStatusLog, ItemWithLogs } from '@/lib/items/types'

export type ServiceErrorCode = 'invalid_input' | 'not_found' | 'forbidden' | 'db_error'
export interface ServiceError { code: ServiceErrorCode; message: string }
export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: ServiceError }

const ok = <T,>(data: T): ServiceResult<T> => ({ data, error: null })
const err = <T = never,>(code: ServiceErrorCode, message: string): ServiceResult<T> =>
  ({ data: null, error: { code, message } })

export function httpStatusForError(code: ServiceErrorCode): number {
  switch (code) {
    case 'invalid_input': return 400
    case 'forbidden':     return 403
    case 'not_found':     return 404
    case 'db_error':      return 500
  }
}

export interface ListItemsFilters {
  q?: string | null
  kind?: string | null
  status?: string | null
  venue_item_id?: string | null
  responsible_person?: string | null
}

export interface CreateItemInput {
  name: string
  kind: ItemKind
  expense_id?: string | null
  placement_venue_item_id?: string | null
  quantity?: number | string
  item_value?: number | null
  status?: ItemStatus
  responsible_person?: string | null
  serial_number?: string | null
  photo_url?: string | null
  notes?: string | null
}

export interface UpdateItemInput extends Partial<CreateItemInput> {
  status_note?: string | null
}

const ITEM_COLS =
  'id, item_code, name, kind, expense_id, placement_venue_item_id, quantity, item_value, status, responsible_person, serial_number, photo_url, notes, created_by_user_id, created_at, updated_at'

// ── list ─────────────────────────────────────────────
export async function listItems(filters: ListItemsFilters): Promise<ServiceResult<Item[]>> {
  const db = createServerClient()
  let query = db.from('items').select(ITEM_COLS).order('created_at', { ascending: false })

  const { q, kind, status, venue_item_id, responsible_person } = filters
  if (q) query = query.or(`name.ilike.%${q}%,item_code.ilike.%${q}%,serial_number.ilike.%${q}%`)
  if (kind) query = query.eq('kind', kind)
  if (status) query = query.eq('status', status)
  if (venue_item_id) query = query.eq('placement_venue_item_id', venue_item_id)
  if (responsible_person) query = query.ilike('responsible_person', `%${responsible_person}%`)

  const { data, error } = await query
  if (error) return err('db_error', error.message)
  return ok((data ?? []) as Item[])
}

// ── get one (with status logs) ───────────────────────
export async function getItem(id: string): Promise<ServiceResult<ItemWithLogs>> {
  const db = createServerClient()
  const { data: item, error } = await db.from('items').select(ITEM_COLS).eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return err('not_found', 'item not found')
    return err('db_error', error.message)
  }
  const { data: logs, error: logErr } = await db
    .from('item_status_logs')
    .select('id, item_id, from_status, to_status, note, changed_by_user_id, changed_at')
    .eq('item_id', id)
    .order('changed_at', { ascending: false })
  if (logErr) return err('db_error', logErr.message)
  return ok({ ...(item as Item), status_logs: (logs ?? []) as ItemStatusLog[] })
}

async function validateItemValue(
  db: ReturnType<typeof createServerClient>,
  item_value: number | null | undefined,
  expense_id: string | null,
): Promise<string | null> {
  if (item_value == null || !expense_id) return null
  const { data: expense } = await db.from('expenses').select('total_price').eq('id', expense_id).single()
  if (expense && item_value > Number(expense.total_price)) {
    return `物品价值（¥${item_value}）不能高于关联开支金额（¥${Number(expense.total_price).toLocaleString('zh-CN')}）`
  }
  return null
}

// ── create ───────────────────────────────────────────
export async function createItem(input: CreateItemInput, actorId?: string): Promise<ServiceResult<Item>> {
  const kind = input.kind
  const status = (input.status ?? 'in_use') as ItemStatus
  const expense_id = input.expense_id || null
  const placement = kind === 'virtual' ? null : (input.placement_venue_item_id || null)
  const quantity = Number(input.quantity) || 1
  const item_value = input.item_value != null ? Number(input.item_value) : null

  const validationError = validateItem({
    name: input.name ?? '',
    kind,
    expense_id,
    placement_venue_item_id: placement,
    quantity,
    status,
  })
  if (validationError) return err('invalid_input', validationError)

  const db = createServerClient()
  const valueError = await validateItemValue(db, item_value, expense_id)
  if (valueError) return err('invalid_input', valueError)

  const { data, error } = await db
    .from('items')
    .insert({
      name: input.name.trim(),
      kind,
      expense_id,
      placement_venue_item_id: placement,
      quantity,
      item_value,
      status,
      responsible_person: input.responsible_person ?? null,
      serial_number: input.serial_number ?? null,
      photo_url: input.photo_url ?? null,
      notes: input.notes ?? null,
      created_by_user_id: actorId ?? null,
    })
    .select(ITEM_COLS)
    .single()

  if (error) {
    if (error.code === '23503') return err('invalid_input', '关联的成本或放置位置不存在')
    return err('db_error', error.message)
  }

  const created = data as Item
  await db.from('item_status_logs').insert({
    item_id: created.id,
    from_status: null,
    to_status: created.status,
    changed_by_user_id: actorId ?? null,
  })

  return ok(created)
}

// ── update (writes a status log on status change) ────
export async function updateItem(id: string, patch: UpdateItemInput, actorId?: string): Promise<ServiceResult<Item>> {
  const db = createServerClient()

  const { data: existing, error: exErr } = await db.from('items').select(ITEM_COLS).eq('id', id).single()
  if (exErr) {
    if (exErr.code === 'PGRST116') return err('not_found', 'item not found')
    return err('db_error', exErr.message)
  }
  const current = existing as Item

  const kind = (patch.kind ?? current.kind) as ItemKind
  const status = (patch.status ?? current.status) as ItemStatus
  const expense_id = patch.expense_id !== undefined ? (patch.expense_id || null) : current.expense_id
  let placement = patch.placement_venue_item_id !== undefined
    ? (patch.placement_venue_item_id || null)
    : current.placement_venue_item_id
  if (kind === 'virtual') placement = null
  const quantity = patch.quantity !== undefined ? (Number(patch.quantity) || 1) : current.quantity
  const name = patch.name !== undefined ? patch.name : current.name
  const item_value = patch.item_value !== undefined
    ? (patch.item_value != null ? Number(patch.item_value) : null)
    : current.item_value

  const validationError = validateItem({ name, kind, expense_id, placement_venue_item_id: placement, quantity, status })
  if (validationError) return err('invalid_input', validationError)

  const valueError = await validateItemValue(db, item_value, expense_id)
  if (valueError) return err('invalid_input', valueError)

  const updates: Record<string, unknown> = {
    name: name.trim(),
    kind,
    expense_id,
    placement_venue_item_id: placement,
    quantity,
    item_value,
    status,
  }
  if (patch.responsible_person !== undefined) updates.responsible_person = patch.responsible_person
  if (patch.serial_number !== undefined) updates.serial_number = patch.serial_number
  if (patch.photo_url !== undefined) updates.photo_url = patch.photo_url
  if (patch.notes !== undefined) updates.notes = patch.notes

  const { data, error } = await db.from('items').update(updates).eq('id', id).select(ITEM_COLS).single()
  if (error) {
    if (error.code === '23503') return err('invalid_input', '关联的成本或放置位置不存在')
    return err('db_error', error.message)
  }

  if (status !== current.status) {
    await db.from('item_status_logs').insert({
      item_id: id,
      from_status: current.status,
      to_status: status,
      note: patch.status_note ?? null,
      changed_by_user_id: actorId ?? null,
    })
  }

  return ok(data as Item)
}

// ── delete ───────────────────────────────────────────
export async function deleteItem(id: string): Promise<ServiceResult<{ id: string }>> {
  const db = createServerClient()
  const { error } = await db.from('items').delete().eq('id', id)
  if (error) return err('db_error', error.message)
  return ok({ id })
}

void ITEM_STATUSES
