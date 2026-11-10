import type { Json, TablesUpdate } from '../supabase/database.types.ts'

// 创作者 POST / PATCH 请求体里允许写入的字段。PATCH 以前把请求体整包展开写库，
// 调用方可以顺手改 created_by_user_id 之类不该由前端决定的列；现在只收下面这些键，
// 其余一律丢弃。status 走 /transition，不在此列。
export const CREATOR_WRITABLE_KEYS = [
  'name',
  'platform',
  'contact_info',
  'profile',
  'notes',
  'broadcast_account_id',
  'operator_user_id',
] as const

export type CreatorWritableFields = Pick<TablesUpdate<'creators'>, (typeof CREATOR_WRITABLE_KEYS)[number]>

export type CreatorFieldsResult =
  | { ok: true; fields: CreatorWritableFields }
  | { ok: false; message: string }

function isJsonObject(value: unknown): value is { [key: string]: Json | undefined } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}

const nullableId = (value: unknown): string | null | undefined =>
  value === undefined ? undefined : typeof value === 'string' && value ? value : null

/**
 * 从请求体里挑出可写字段并逐个校验类型。只看出现的键：PATCH 时没出现的键不动。
 * platform 的规范化由调用方做（它还要决定空值时的报错文案）。
 */
export function pickCreatorFields(body: Record<string, unknown>): CreatorFieldsResult {
  const fields: CreatorWritableFields = {}
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { ok: false, message: 'name must be a non-empty string' }
    fields.name = body.name
  }
  if ('platform' in body) {
    if (typeof body.platform !== 'string') return { ok: false, message: 'platform must be a string' }
    fields.platform = body.platform
  }
  for (const key of ['contact_info', 'profile'] as const) {
    if (!(key in body) || body[key] === undefined) continue
    if (!isJsonObject(body[key])) return { ok: false, message: `${key} must be an object` }
    fields[key] = body[key]
  }
  if ('notes' in body && body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') return { ok: false, message: 'notes must be a string' }
    fields.notes = body.notes
  }
  // 空字符串 / null / 其它假值都表示「解除关联」，与旧行为一致。
  if ('broadcast_account_id' in body) fields.broadcast_account_id = nullableId(body.broadcast_account_id)
  if ('operator_user_id' in body) fields.operator_user_id = nullableId(body.operator_user_id)
  return { ok: true, fields }
}
