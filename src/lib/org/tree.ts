import type { MemberType, PersonOption } from '../types/index.ts'

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
