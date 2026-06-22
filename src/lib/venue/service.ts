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

// 单一共享场地的 id（迁移 029 预置）。
const SHARED_VENUE_ID = 'guild-main'

export async function getVenueLayout(): Promise<ServiceResult<VenueLayout>> {
  const db = createServerClient()

  const { data: venue, error: venueErr } = await db
    .from('venues')
    .select('id, name, width, height')
    .eq('id', SHARED_VENUE_ID)
    .single()
  if (venueErr) {
    if (venueErr.code === 'PGRST116') return err('not_found', 'venue not found')
    return err('db_error', venueErr.message)
  }

  const { data: floors, error: floorErr } = await db
    .from('venue_floors')
    .select('id, venue_id, name, width, height, floor_height, background_image, sort_order')
    .eq('venue_id', SHARED_VENUE_ID)
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
  const { venue, floors, items } = layoutToRows({ ...layout, venueId: SHARED_VENUE_ID })

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
    let delFloors = db.from('venue_floors').delete().eq('venue_id', SHARED_VENUE_ID)
    if (floorIds.length > 0) delFloors = delFloors.not('id', 'in', `(${floorIds.join(',')})`)
    const { error } = await delFloors
    if (error) return err('db_error', error.message)
  }

  return getVenueLayout()
}
