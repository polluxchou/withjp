import { createServerClient } from '@/lib/supabase/server'
import { pendingTranslations, translateNames, type NameTranslations, type TranslatableRow } from '@/lib/venue/translate'
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

// canEdit: 可改画布; canManage: 可管理协作者(=创办人/管理员)。
export type VenueSummary = { id: string; name: string; canEdit: boolean; canManage: boolean }

type DB = ReturnType<typeof createServerClient>

async function isAdminUser(db: DB, userId: string): Promise<boolean> {
  const { data } = await db.from('users').select('is_admin').eq('id', userId).maybeSingle()
  return !!data?.is_admin
}

// Access rule: owner_id null = legacy/open (anyone). Otherwise edit requires
// admin / owner / listed editor; manage (collaborators) requires admin / owner.
export async function getVenueAccess(userId: string, venueId: string): Promise<{ canEdit: boolean; canManage: boolean }> {
  const db = createServerClient()
  const { data: venue } = await db.from('venues').select('owner_id').eq('id', venueId).maybeSingle()
  const ownerId = (venue?.owner_id as string | null) ?? null
  const admin = await isAdminUser(db, userId)
  const canManage = admin || ownerId === userId
  if (canManage || ownerId === null) return { canEdit: true, canManage }
  const { data: editor } = await db.from('venue_editors').select('user_id').eq('venue_id', venueId).eq('user_id', userId).maybeSingle()
  return { canEdit: !!editor, canManage }
}

// 列出所有场地（所有人可见/可切换），并标注当前用户的编辑/管理权限。
export async function listVenues(userId: string): Promise<ServiceResult<VenueSummary[]>> {
  const db = createServerClient()
  const { data, error } = await db
    .from('venues')
    .select('id, name, owner_id')
    .order('created_at', { ascending: true })
  if (error) return err('db_error', error.message)
  const admin = await isAdminUser(db, userId)
  const { data: editorRows } = await db.from('venue_editors').select('venue_id').eq('user_id', userId)
  const editorSet = new Set((editorRows ?? []).map((r) => r.venue_id as string))
  const venues: VenueSummary[] = (data ?? []).map((v) => {
    const ownerId = (v.owner_id as string | null) ?? null
    const canManage = admin || ownerId === userId
    const canEdit = canManage || ownerId === null || editorSet.has(v.id as string)
    return { id: v.id as string, name: v.name as string, canEdit, canManage }
  })
  return ok(venues)
}

// 新建一个空场地（含一个默认楼层），创办人记为当前用户，返回其布局。
export async function createVenue(name: string, ownerId: string): Promise<ServiceResult<VenueLayout>> {
  const trimmed = (name || '').trim()
  if (!trimmed) return err('invalid_input', 'venue name required')

  const db = createServerClient()
  const venueId = `venue-${crypto.randomUUID().slice(0, 8)}`
  const floorId = `${venueId}-1f`

  const { error: venueErr } = await db.from('venues').insert({
    id: venueId, name: trimmed, width: 1200, height: 800, view_bookmarks: [], owner_id: ownerId,
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

export async function saveVenueLayout(layout: VenueLayout, userId: string): Promise<ServiceResult<VenueLayout>> {
  if (!layout || typeof layout.venueId !== 'string' || !Array.isArray(layout.floors)) {
    return err('invalid_input', 'invalid layout payload')
  }

  const access = await getVenueAccess(userId, layout.venueId)
  if (!access.canEdit) return err('forbidden', '你没有编辑该场地的权限')

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

// ── Collaborators ─────────────────────────────────────────────

export async function getVenueEditors(venueId: string, actorId: string): Promise<ServiceResult<{ userIds: string[]; canManage: boolean }>> {
  const db = createServerClient()
  const access = await getVenueAccess(actorId, venueId)
  const { data, error } = await db.from('venue_editors').select('user_id').eq('venue_id', venueId)
  if (error) return err('db_error', error.message)
  return ok({ userIds: (data ?? []).map((r) => r.user_id as string), canManage: access.canManage })
}

// Replace the editor set for a venue. Only the owner / an admin may do this.
export async function setVenueEditors(venueId: string, userIds: string[], actorId: string): Promise<ServiceResult<{ userIds: string[] }>> {
  const access = await getVenueAccess(actorId, venueId)
  if (!access.canManage) return err('forbidden', '只有创办人或管理员可以管理协作者')

  const db = createServerClient()
  const { error: delErr } = await db.from('venue_editors').delete().eq('venue_id', venueId)
  if (delErr) return err('db_error', delErr.message)

  const unique = Array.from(new Set(userIds.filter((id) => typeof id === 'string' && id.length > 0)))
  if (unique.length > 0) {
    const rows = unique.map((user_id) => ({ venue_id: venueId, user_id }))
    const { error } = await db.from('venue_editors').insert(rows)
    if (error) return err('db_error', error.message)
  }
  return ok({ userIds: unique })
}

// 翻译某场地下所有陈旧的组件名称,写回译名列,并返回该场地的完整译名映射。
// 幂等:可在加载后与每次保存后重复调用。Gemini 失败时跳过写库,返回已有译名。
export async function translateVenueItemNames(
  venueId: string = SHARED_VENUE_ID,
): Promise<ServiceResult<NameTranslations>> {
  const db = createServerClient()

  const { data: floors, error: floorErr } = await db
    .from('venue_floors').select('id').eq('venue_id', venueId)
  if (floorErr) return err('db_error', floorErr.message)
  const floorIds = (floors ?? []).map((f) => f.id)
  if (floorIds.length === 0) return ok({})

  const { data: rows, error: rowErr } = await db
    .from('venue_items')
    .select('id, name, name_ja, name_en, name_i18n_source')
    .in('floor_id', floorIds)
  if (rowErr) return err('db_error', rowErr.message)
  const allRows = (rows ?? []) as TranslatableRow[]

  const pending = pendingTranslations(allRows)
  if (pending.length > 0) {
    const results = await translateNames(pending.map((r) => r.name))
    if (results) {
      await Promise.all(
        pending.map((row, i) =>
          db.from('venue_items')
            .update({ name_ja: results[i].ja, name_en: results[i].en, name_i18n_source: row.name })
            .eq('id', row.id),
        ),
      )
      pending.forEach((row, i) => {
        row.name_ja = results[i].ja
        row.name_en = results[i].en
      })
    }
  }

  const map: NameTranslations = {}
  for (const r of allRows) {
    if (r.name_ja || r.name_en) map[r.id] = { ja: r.name_ja, en: r.name_en }
  }
  return ok(map)
}
