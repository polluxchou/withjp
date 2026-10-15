// src/lib/tasks/manual-update.ts — PATCH /api/tasks/:id 手动改字段的白名单。
//
// 只许改 status 与 next_action。output、agent_id、creator_id、input、
// parent_task_id 等由创建与 Agent 执行写入，手动改会让任务和它的产出对不上。
// 白名单外的字段整单拒绝而不是悄悄丢掉：写错键的调用方能立刻看到 400。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名。

import type { TaskStatus } from '../types/index.ts'

// 与数据库 task_status 枚举同序（manual-update.test.ts 对照迁移文件）。
export const TASK_STATUSES: readonly TaskStatus[] = ['pending', 'running', 'done', 'failed']

export interface TaskManualPatch {
  status?: TaskStatus
  next_action?: string | null
}

export type TaskManualUpdate = { ok: true; patch: TaskManualPatch } | { ok: false; error: string }

function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v)
}

export function pickTaskManualUpdate(body: unknown): TaskManualUpdate {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object' }
  }
  const fields = body as Record<string, unknown>
  const keys = Object.keys(fields)
  const rejected = keys.filter((k) => k !== 'status' && k !== 'next_action')
  if (rejected.length > 0) {
    return { ok: false, error: `Only status and next_action can be updated; got: ${rejected.join(', ')}` }
  }
  if (keys.length === 0) return { ok: false, error: 'Nothing to update: send status and/or next_action' }

  const patch: TaskManualPatch = {}
  if (keys.includes('status')) {
    if (!isTaskStatus(fields.status)) return { ok: false, error: `status must be one of: ${TASK_STATUSES.join(', ')}` }
    patch.status = fields.status
  }
  if (keys.includes('next_action')) {
    const next = fields.next_action
    if (next !== null && typeof next !== 'string') return { ok: false, error: 'next_action must be a string or null' }
    patch.next_action = next
  }
  return { ok: true, patch }
}
