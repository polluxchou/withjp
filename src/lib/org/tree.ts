import type { BusinessTask, MemberType, OrgSnapshot, PersonOption, PositionMember, TaskItem } from '../types/index.ts'

interface RefLike {
  member_type: MemberType | null
  user_id: string | null
  creator_id: string | null
}

// 二选一校验：user→只有 user_id；creator→只有 creator_id
export function validatePersonRef(ref: RefLike): boolean {
  if (ref.member_type === 'user')    return !!ref.user_id && !ref.creator_id
  if (ref.member_type === 'creator') return !!ref.creator_id && !ref.user_id
  return false
}

// 从候选人里解析 owner 显示名；无 owner 或查不到 → null
export function ownerNameOf(ref: RefLike, people: PersonOption[]): string | null {
  if (ref.member_type === 'user' && ref.user_id) {
    return people.find((p) => p.member_type === 'user' && p.id === ref.user_id)?.name ?? null
  }
  if (ref.member_type === 'creator' && ref.creator_id) {
    return people.find((p) => p.member_type === 'creator' && p.id === ref.creator_id)?.name ?? null
  }
  return null
}

// 升序稳定排序（不改原数组）
export function sortByOrder<T extends { sort_order: number }>(rows: T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.sort_order - b.row.sort_order || a.i - b.i)
    .map(({ row }) => row)
}

// ── 客户端就地更新（不可变）──────────────────────────────
// 写操作成功后，用返回的 id + 已持有的输入直接更新本地快照，
// 避免再发一次可能失败的整表 GET /api/org。

// 把选中的候选人（或 null=清除）拆成 owner_* 三字段
function ownerFields(person: PersonOption | null) {
  return {
    owner_member_type: person?.member_type ?? null,
    owner_user_id:     person?.member_type === 'user' ? person.id : null,
    owner_creator_id:  person?.member_type === 'creator' ? person.id : null,
    owner_name:        person?.name ?? null,
  }
}

// 在指定业务上映射任务列表
function mapTasks(snapshot: OrgSnapshot, businessId: string, fn: (tasks: BusinessTask[]) => BusinessTask[]): OrgSnapshot {
  return {
    ...snapshot,
    businesses: snapshot.businesses.map((b) => (b.id === businessId ? { ...b, tasks: fn(b.tasks) } : b)),
  }
}

// 对所有业务的所有任务做映射（用于按 taskId/itemId 定位而不需要 businessId）
function mapAllTasks(snapshot: OrgSnapshot, fn: (task: BusinessTask) => BusinessTask): OrgSnapshot {
  return {
    ...snapshot,
    businesses: snapshot.businesses.map((b) => ({ ...b, tasks: b.tasks.map(fn) })),
  }
}

export function applyAddTask(snapshot: OrgSnapshot, businessId: string, taskId: string, name: string): OrgSnapshot {
  return mapTasks(snapshot, businessId, (tasks) => {
    const nextOrder = tasks.reduce((max, t) => Math.max(max, t.sort_order), 0) + 1
    const task: BusinessTask = { id: taskId, business_id: businessId, name, sort_order: nextOrder, position_ids: [], items: [] }
    return [...tasks, task]
  })
}

export function applyDeleteTask(snapshot: OrgSnapshot, taskId: string): OrgSnapshot {
  return {
    ...snapshot,
    businesses: snapshot.businesses.map((b) => ({ ...b, tasks: b.tasks.filter((t) => t.id !== taskId) })),
  }
}

export function applyAddItem(snapshot: OrgSnapshot, taskId: string, itemId: string, name: string): OrgSnapshot {
  return mapAllTasks(snapshot, (t) => {
    if (t.id !== taskId) return t
    const nextOrder = t.items.reduce((max, it) => Math.max(max, it.sort_order), 0) + 1
    const item: TaskItem = { id: itemId, task_id: taskId, name, sort_order: nextOrder, owner_member_type: null, owner_user_id: null, owner_creator_id: null, owner_name: null }
    return { ...t, items: [...t.items, item] }
  })
}

export function applyDeleteItem(snapshot: OrgSnapshot, itemId: string): OrgSnapshot {
  return mapAllTasks(snapshot, (t) => ({ ...t, items: t.items.filter((it) => it.id !== itemId) }))
}

export function applySetBusinessOwner(snapshot: OrgSnapshot, businessId: string, person: PersonOption | null): OrgSnapshot {
  return {
    ...snapshot,
    businesses: snapshot.businesses.map((b) => (b.id === businessId ? { ...b, ...ownerFields(person) } : b)),
  }
}

export function applySetItemOwner(snapshot: OrgSnapshot, itemId: string, person: PersonOption | null): OrgSnapshot {
  const f = ownerFields(person)
  return mapAllTasks(snapshot, (t) => ({
    ...t,
    items: t.items.map((it) => (it.id === itemId
      ? { ...it, owner_member_type: f.owner_member_type, owner_user_id: f.owner_user_id, owner_creator_id: f.owner_creator_id, owner_name: f.owner_name }
      : it)),
  }))
}

export function applyAddMember(snapshot: OrgSnapshot, positionId: string, memberId: string, person: PersonOption): OrgSnapshot {
  const member: PositionMember = {
    id: memberId,
    position_id: positionId,
    member_type: person.member_type,
    user_id: person.member_type === 'user' ? person.id : null,
    creator_id: person.member_type === 'creator' ? person.id : null,
    display_name: person.name,
  }
  return {
    ...snapshot,
    positions: snapshot.positions.map((p) => (p.id === positionId ? { ...p, members: [...p.members, member] } : p)),
  }
}

export function applyRemoveMember(snapshot: OrgSnapshot, positionId: string, memberId: string): OrgSnapshot {
  return {
    ...snapshot,
    positions: snapshot.positions.map((p) => (p.id === positionId ? { ...p, members: p.members.filter((m) => m.id !== memberId) } : p)),
  }
}

export function applySetTaskPositions(snapshot: OrgSnapshot, taskId: string, positionIds: string[]): OrgSnapshot {
  const unique = Array.from(new Set(positionIds))
  return mapAllTasks(snapshot, (t) => (t.id === taskId ? { ...t, position_ids: unique } : t))
}
