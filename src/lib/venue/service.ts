import { createServerClient } from '@/lib/supabase/server'
import { layoutToRows, rowsToLayout } from '@/lib/venue/layout-sync'
import type { VenueRow, VenueFloorRow, VenueItemRow } from '@/lib/venue/layout-sync'
import type { VenueLayout } from '@/venue/layoutData'

export type ServiceErrorCode = 'invalid_input' | 'not_found' | 'forbidden' | 'db_error'

export interface ServiceError {
  code: ServiceErrorCode
  message: string
}

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

// 默认（迁移 029 预置）场地的 id；新建场地用随机 id。
const SHARED_VENUE_ID = 'guild-main'

export type VenueSummary = { id: string; name: string }

// 列出所有场地（用于切换器）。
export async function listVenues(): Promise<ServiceResult<VenueSummary[]>> {
  const db = createServerClient()
  const { data, error } = await db
    .from('venues')
    .select('id, name')
    .order('created_at', { ascending: true })
  if (error) return err('db_error', error.message)
  return ok((data ?? []) as VenueSummary[])
}

// 新建一个空场地（含一个默认楼层），返回其布局。
export async function createVenue(name: string): Promise<ServiceResult<VenueLayout>> {
  const trimmed = (name || '').trim()
  if (!trimmed) return err('invalid_input', 'venue name required')

  const db = createServerClient()
  const venueId = `venue-${crypto.randomUUID().slice(0, 8)}`
  const floorId = `${venueId}-1f`

  const { error: venueErr } = await db.from('venues').insert({
    id: venueId, name: trimmed, width: 1200, height: 800, view_bookmarks: [],
  })
  if (venueErr) return err('db_error', venueErr.message)

  const { error: floorErr } = await db.from('venue_floors').insert({
    id: floorId, venue_id: venueId, name: '1F', width: 1200, height: 800, floor_height: 280, sort_order: 0,
  })
  if (floorErr) return err('db_error', floorErr.message)

  return getVenueLayout(venueId)
}

export async function getVenueLayout(venueId: string = SHARED_VENUE_ID): Promise<ServiceResult<VenueLayout>> {
  const db = createServerClient()

  const { data: venue, error: venueErr } = await db
    .from('venues')
    .select('id, name, width, height, view_bookmarks')
    .eq('id', venueId)
    .single()
  if (venueErr) {
    if (venueErr.code === 'PGRST116') return err('not_found', 'venue not found')
    return err('db_error', venueErr.message)
  }

  const { data: floors, error: floorErr } = await db
    .from('venue_floors')
    .select('id, venue_id, name, width, height, floor_height, background_image, sort_order')
    .eq('venue_id', venueId)
  if (floorErr) return err('db_error', floorErr.message)

  const floorIds = (floors ?? []).map((f) => f.id)
  let items: VenueItemRow[] = []
  if (floorIds.length > 0) {
    const { data: itemRows, error: itemErr } = await db
      .from('venue_items')
      .select('id, floor_id, type, name, x, y, width, height, rotation, status, note, z_index, height3d, elevation')
      .in('floor_id', floorIds)
    if (itemErr) return err('db_error', itemErr.message)
    items = (itemRows ?? []) as VenueItemRow[]
  }

  return ok(rowsToLayout(venue as VenueRow, (floors ?? []) as VenueFloorRow[], items))
}

export async function saveVenueLayout(layout: VenueLayout): Promise<ServiceResult<VenueLayout>> {
  if (!layout || typeof layout.venueId !== 'string' || !Array.isArray(layout.floors)) {
    return err('invalid_input', 'invalid layout payload')
  }

  const db = createServerClient()
  const { venue, floors, items } = layoutToRows(layout)

  // 1) upsert 场地
  {
    const { error } = await db.from('venues').upsert(venue, { onConflict: 'id' })
    if (error) return err('db_error', error.message)
  }

  // 2) upsert 楼层
  if (floors.length > 0) {
    const { error } = await db.from('venue_floors').upsert(floors, { onConflict: 'id' })
    if (error) return err('db_error', error.message)
  }

  // 3) upsert 对象
  if (items.length > 0) {
    const { error } = await db.from('venue_items').upsert(items, { onConflict: 'id' })
    if (error) {
      if (error.code === '23503') {
        return err('invalid_input', '该场地对象仍被物品引用，无法修改/删除，请先在物品管理中改挂或删除。')
      }
      return err('db_error', error.message)
    }
  }

  // 4) 删除已移除的对象（按楼层范围，保留本次 payload 中的 id）
  const floorIds = floors.map((f) => f.id)
  const itemIds = items.map((i) => i.id)
  if (floorIds.length > 0) {
    let delItems = db.from('venue_items').delete().in('floor_id', floorIds)
    if (itemIds.length > 0) delItems = delItems.not('id', 'in', `(${itemIds.join(',')})`)
    const { error } = await delItems
    if (error) {
      if (error.code === '23503') {
        return err('invalid_input', '该场地对象仍被物品引用，无法删除，请先在物品管理中改挂或删除。')
      }
      return err('db_error', error.message)
    }
  }

  // 5) 删除已移除的楼层（cascade 会带走其对象）
  {
    let delFloors = db.from('venue_floors').delete().eq('venue_id', layout.venueId)
    if (floorIds.length > 0) delFloors = delFloors.not('id', 'in', `(${floorIds.join(',')})`)
    const { error } = await delFloors
    if (error) return err('db_error', error.message)
  }

  return getVenueLayout(layout.venueId)
}
