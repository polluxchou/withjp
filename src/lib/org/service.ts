import { createServerClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { ownerNameOf, sortByOrder, validatePersonRef } from './tree'
import { validateItemPatch } from './quadrant'
import type {
  Business, BusinessTask, MemberType, OrgSnapshot, PersonOption,
  Position, PositionMember, TaskItem,
} from '@/lib/types'
import type { TablesUpdate } from '@/lib/supabase/database.types'

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

// owner_member_type 在库里是 text（带 check 约束），读出来时收窄。
const toMemberType = (v: string | null): MemberType | null => (v === 'user' || v === 'creator' ? v : null)

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
    fetchAllRows((from, to) => db.from('creators').select('id, name')
      .order('name').order('id', { ascending: true }).range(from, to)),
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
    // 任务、任务×岗位、事项三张表随业务增长，分页取全：单次响应最多 1000 行且静默截断。
    fetchAllRows((from, to) => db.from('business_tasks').select('*')
      .order('id', { ascending: true }).range(from, to)),
    // 任务卡上的岗位标签按这里的返回顺序排，所以先按加入时间、再以 id 兜底。
    fetchAllRows((from, to) => db.from('business_task_positions').select('task_id, position_id')
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => db.from('task_items').select('*')
      .order('id', { ascending: true }).range(from, to)),
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
  const tasksRaw = taskRes.data ?? []

  const tasks: BusinessTask[] = sortByOrder(tasksRaw).map((t) => ({
    id: t.id, business_id: t.business_id, name: t.name, sort_order: t.sort_order,
    position_ids: btp.filter((x) => x.task_id === t.id).map((x) => x.position_id),
    items: sortByOrder(items.filter((it) => it.task_id === t.id))
      .map((it) => ({ ...it, owner_name: ownerNameOf({ member_type: it.owner_member_type, user_id: it.owner_user_id, creator_id: it.owner_creator_id }, people) })),
  }))

  const businesses: Business[] = sortByOrder(bizRes.data ?? []).map((b) => {
    const owner_member_type = toMemberType(b.owner_member_type)
    return {
      ...b,
      owner_member_type,
      owner_name: ownerNameOf({ member_type: owner_member_type, user_id: b.owner_user_id, creator_id: b.owner_creator_id }, people),
      tasks: tasks.filter((t) => t.business_id === b.id),
    }
  })

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
  patch: {
    name?: string
    owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null
    /** 原始请求体：只取其中 is_important / due_date / status 三个键（见 validateItemPatch）。 */
    quadrant?: unknown
  },
): Promise<ServiceResult<{ id: string }>> {
  const forbidden = await requireAdmin(userId); if (forbidden) return { data: null, error: forbidden }
  const db = createServerClient()
  const update: TablesUpdate<'task_items'> = { updated_at: new Date().toISOString() }
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
  if (patch.quadrant !== undefined) {
    const checked = validateItemPatch(patch.quadrant)
    if (!checked.ok) return err('invalid_input', checked.message)
    Object.assign(update, checked.value)
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
