import type { Json, TablesUpdate } from '../supabase/database.types.ts'
import { isDbEnum } from '../supabase/enums.ts'

// 里程碑 POST / PATCH 请求体里允许写入的字段。completed_date / status 的语义由
// completion.ts 推导，这里只做类型校验；POST 不收 status（建表接口从来不收）。
export const MILESTONE_WRITABLE_KEYS = [
  'title', 'description', 'type', 'level', 'priority', 'status', 'risk_level',
  'owner_agent_id', 'involved_agent_ids', 'linked_creator_ids', 'linked_task_ids',
  'parent_milestone_id', 'start_date', 'target_date', 'completed_date', 'success_metric', 'notes',
] as const

export type MilestoneWritableFields = Pick<TablesUpdate<'milestones'>, (typeof MILESTONE_WRITABLE_KEYS)[number]>

export type MilestoneFieldsResult =
  | { ok: true; fields: MilestoneWritableFields }
  | { ok: false; message: string }

const ENUM_COLUMNS = {
  type: 'milestone_type',
  level: 'milestone_level',
  priority: 'milestone_priority',
  status: 'milestone_status',
  risk_level: 'risk_level',
} as const

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

function isJsonObject(value: unknown): value is { [key: string]: Json | undefined } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}

/**
 * 挑出出现的可写字段并逐个校验类型。与旧行为一致：出现但值为 null 的键按「清空」
 * 处理（PATCH 把 `body[key] ?? null` 写库）；不可为空的列收到 null 会被拒绝。
 * completed_date 原样保留，由 normalizeDayStamp 解析。
 */
export function pickMilestoneFields(body: Record<string, unknown>): MilestoneFieldsResult {
  const fields: MilestoneWritableFields = {}
  const bad = (key: string, what: string): MilestoneFieldsResult => ({ ok: false, message: `${key} must be ${what}` })
  for (const key of MILESTONE_WRITABLE_KEYS) {
    if (!(key in body)) continue
    const value = body[key] ?? null
    switch (key) {
      case 'type': case 'level': case 'priority': case 'status': case 'risk_level': {
        const enumName = ENUM_COLUMNS[key]
        if (!isDbEnum(enumName, value)) return bad(key, `one of the ${enumName} values`)
        Object.assign(fields, { [key]: value })
        break
      }
      case 'title': case 'start_date': case 'target_date':
        if (typeof value !== 'string' || !value.trim()) return bad(key, 'a non-empty string')
        fields[key] = value
        break
      case 'description': case 'notes': case 'owner_agent_id': case 'parent_milestone_id':
        if (value !== null && typeof value !== 'string') return bad(key, 'a string or null')
        fields[key] = value
        break
      case 'completed_date':
        if (value !== null && typeof value !== 'string') return bad(key, 'a date string or null')
        fields.completed_date = value
        break
      case 'involved_agent_ids': case 'linked_creator_ids': case 'linked_task_ids':
        if (!isStringArray(value)) return bad(key, 'an array of ids')
        fields[key] = value
        break
      case 'success_metric':
        if (!isJsonObject(value)) return bad(key, 'an object')
        fields.success_metric = value
        break
    }
  }
  return { ok: true, fields }
}
