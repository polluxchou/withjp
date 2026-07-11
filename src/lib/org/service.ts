import { createServerClient } from '@/lib/supabase/server'
import { ownerNameOf, sortByOrder, validatePersonRef } from './tree'
import type {
  Business, BusinessTask, MemberType, OrgSnapshot, PersonOption,
  Position, PositionMember, TaskItem,
} from '@/lib/types'

export type ServiceErrorCode = 'invalid_input' | 'forbidden' | 'not_found' | 'db_error'
export interface ServiceError { code: ServiceErrorCode; message: string }
export type ServiceResult<T> = { data: T; error: null } | { data: null; error: ServiceError }

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

type DB = ReturnType<typeof createServerClient>

async function isAdminUser(db: DB, userId: string): Promise<boolean> {
  const { data } = await db.from('users').select('is_admin').eq('id', userId).maybeSingle()
  return !!data?.is_admin
}

async function requireAdmin(userId: string): Promise<ServiceError | null> {
  const db = createServerClient()
  return (await isAdminUser(db, userId)) ? null : { code: 'forbidden', message: 'admin only' }
}

async function loadPeople(db: DB): Promise<PersonOption[]> {
  const [{ data: users }, { data: creators }] = await Promise.all([
    db.from('users').select('id, name').order('name'),
    db.from('creators').select('id, name').order('name'),
  ])
  return [
    ...(users ?? []).map((u): PersonOption => ({ member_type: 'user', id: u.id as string, name: (u.name as string) ?? '' })),
    ...(creators ?? []).map((c): PersonOption => ({ member_type: 'creator', id: c.id as string, name: (c.name as string) ?? '' })),
  ]
}

export async function getOrgSnapshot(userId: string): Promise<ServiceResult<OrgSnapshot>> {
  const db = createServerClient()
  const [bizRes, taskRes, btpRes, itemRes, posRes, memRes] = await Promise.all([
    db.from('businesses').select('*'),
    db.from('business_tasks').select('*'),
    db.from('business_task_positions').select('task_id, position_id'),
    db.from('task_items').select('*'),
    db.from('positions').select('*'),
    db.from('position_members').select('*'),
  ])
  if (bizRes.error || taskRes.error || btpRes.error || itemRes.error || posRes.error || memRes.error) {
    return err('db_error', 'failed to load org')
  }

  const people = await loadPeople(db)
  const canEdit = await isAdminUser(db, userId)

  const positionsRows = sortByOrder((posRes.data ?? []) as Position[])
  const members = (memRes.data ?? []) as PositionMember[]
  const positions = positionsRows.map((p) => ({
    ...p,
    members: members
      .filter((m) => m.position_id === p.id)
      .map((m) => ({ ...m, display_name: ownerNameOf(m, people) ?? '' })),
  }))

  const btp = (btpRes.data ?? []) as { task_id: string; position_id: string }[]
  const items = (itemRes.data ?? []) as TaskItem[]
  const tasksRaw = (taskRes.data ?? []) as (BusinessTask & { sort_order: number })[]

  const tasks: BusinessTask[] = sortByOrder(tasksRaw).map((t) => ({
    id: t.id, business_id: t.business_id, name: t.name, sort_order: t.sort_order,
    position_ids: btp.filter((x) => x.task_id === t.id).map((x) => x.position_id),
    items: sortByOrder(items.filter((it) => it.task_id === t.id))
      .map((it) => ({ ...it, owner_name: ownerNameOf({ member_type: it.owner_member_type, user_id: it.owner_user_id, creator_id: it.owner_creator_id }, people) })),
  }))

  const businesses: Business[] = sortByOrder((bizRes.data ?? []) as Business[]).map((b) => ({
    ...b,
    owner_name: ownerNameOf({ member_type: b.owner_member_type, user_id: b.owner_user_id, creator_id: b.owner_creator_id }, people),
    tasks: tasks.filter((t) => t.business_id === b.id),
  }))

  return ok({ businesses, positions, people, canEdit })
}

export async function setBusinessOwner(
  userId: string, businessId: string,
  owner: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null,
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (owner && !validatePersonRef(owner)) return err('invalid_input', 'bad person ref')
  const db = createServerClient()
  const patch = owner
    ? { owner_member_type: owner.member_type, owner_user_id: owner.user_id, owner_creator_id: owner.creator_id, updated_at: new Date().toISOString() }
    : { owner_member_type: null, owner_user_id: null, owner_creator_id: null, updated_at: new Date().toISOString() }
  const { error } = await db.from('businesses').update(patch).eq('id', businessId)
  return error ? err('db_error', error.message) : ok({ id: businessId })
}

export async function createTask(userId: string, businessId: string, name: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!name.trim()) return err('invalid_input', 'name required')
  const db = createServerClient()
  const { data: maxRow } = await db.from('business_tasks').select('sort_order').eq('business_id', businessId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 1
  const { data, error } = await db.from('business_tasks').insert({ business_id: businessId, name: name.trim(), sort_order: nextOrder }).select('id').single()
  return error ? err('db_error', error.message) : ok({ id: data!.id as string })
}

export async function renameTask(userId: string, taskId: string, name: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!name.trim()) return err('invalid_input', 'name required')
  const db = createServerClient()
  const { error } = await db.from('business_tasks').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', taskId)
  return error ? err('db_error', error.message) : ok({ id: taskId })
}

export async function deleteTask(userId: string, taskId: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error } = await db.from('business_tasks').delete().eq('id', taskId)
  return error ? err('db_error', error.message) : ok({ id: taskId })
}

export async function setTaskPositions(userId: string, taskId: string, positionIds: string[]): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error: delErr } = await db.from('business_task_positions').delete().eq('task_id', taskId)
  if (delErr) return err('db_error', delErr.message)
  const unique = Array.from(new Set(positionIds))
  if (unique.length > 0) {
    const rows = unique.map((position_id) => ({ task_id: taskId, position_id }))
    const { error } = await db.from('business_task_positions').insert(rows)
    if (error) return err('db_error', error.message)
  }
  return ok({ id: taskId })
}

export async function createItem(userId: string, taskId: string, name: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!name.trim()) return err('invalid_input', 'name required')
  const db = createServerClient()
  const { data: maxRow } = await db.from('task_items').select('sort_order').eq('task_id', taskId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = ((maxRow?.sort_order as number) ?? 0) + 1
  const { data, error } = await db.from('task_items').insert({ task_id: taskId, name: name.trim(), sort_order: nextOrder }).select('id').single()
  return error ? err('db_error', error.message) : ok({ id: data!.id as string })
}

export async function updateItem(
  userId: string, itemId: string,
  patch: { name?: string; owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return err('invalid_input', 'name required')
    update.name = patch.name.trim()
  }
  if (patch.owner !== undefined) {
    if (patch.owner && !validatePersonRef(patch.owner)) return err('invalid_input', 'bad person ref')
    update.owner_member_type = patch.owner?.member_type ?? null
    update.owner_user_id     = patch.owner?.user_id ?? null
    update.owner_creator_id  = patch.owner?.creator_id ?? null
  }
  const { error } = await db.from('task_items').update(update).eq('id', itemId)
  return error ? err('db_error', error.message) : ok({ id: itemId })
}

export async function deleteItem(userId: string, itemId: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error } = await db.from('task_items').delete().eq('id', itemId)
  return error ? err('db_error', error.message) : ok({ id: itemId })
}

export async function addPositionMember(
  userId: string, positionId: string,
  ref: { member_type: MemberType; user_id: string | null; creator_id: string | null },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  if (!validatePersonRef(ref)) return err('invalid_input', 'bad person ref')
  const db = createServerClient()
  const { data, error } = await db.from('position_members')
    .insert({ position_id: positionId, member_type: ref.member_type, user_id: ref.user_id, creator_id: ref.creator_id })
    .select('id').single()
  return error ? err('db_error', error.message) : ok({ id: data!.id as string })
}

export async function removePositionMember(userId: string, memberId: string): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const { error } = await db.from('position_members').delete().eq('id', memberId)
  return error ? err('db_error', error.message) : ok({ id: memberId })
}
