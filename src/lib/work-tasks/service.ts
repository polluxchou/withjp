import { createServerClient } from '@/lib/supabase/server'
import type { WorkTaskCreatePayload } from '@/lib/intent/schema'
import { matchItemByName } from '@/lib/work-tasks/org-link'
import { fetchTaskItemName } from '@/lib/work-tasks/item-snapshot'

export type WorkTaskServiceError = { code: string; message: string }

async function resolveUserByName(
  db:   ReturnType<typeof createServerClient>,
  name: string,
): Promise<string | null> {
  const { data } = await db
    .from('users')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function createWorkTaskFromIntent(
  payload:  WorkTaskCreatePayload,
  actorId:  string,
): Promise<{ data: { id: string }; error: null } | { data: null; error: WorkTaskServiceError }> {
  const db    = createServerClient()
  const today = new Date().toISOString().slice(0, 10)

  const owner_user_id = payload.owner_name
    ? ((await resolveUserByName(db, payload.owner_name)) ?? actorId)
    : actorId

  const reviewer_user_id = payload.reviewer_name
    ? await resolveUserByName(db, payload.reviewer_name)
    : null

  const executor_ids: string[] = []
  for (const name of payload.executor_names ?? []) {
    const id = await resolveUserByName(db, name)
    if (id) executor_ids.push(id)
  }

  let itemId = payload.business_task_item_id ?? null
  if (!itemId) {
    const { data: items } = await db.from('task_items').select('id, name')
    itemId = matchItemByName((items ?? []) as { id: string; name: string }[], payload.title)
  }
  const itemName = itemId ? await fetchTaskItemName(db, itemId) : null

  const { data, error } = await db
    .from('work_tasks')
    .insert({
      title:               payload.title,
      task_type:           payload.task_type           ?? 'adhoc',
      department:          payload.department           ?? 'ops',
      owner_user_id,
      reviewer_user_id,
      executor_ids,
      task_date:           payload.task_date            ?? today,
      due_date:            payload.due_date             ?? null,
      effort_hours:        payload.effort_hours         ?? 2,
      repeat_interval:     payload.repeat_interval      ?? null,
      completion_criteria: payload.completion_criteria  ?? null,
      notes:               payload.notes                ?? null,
      status:              'planned',
      business_task_item_id:   itemId,
      business_task_item_name: itemName,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: { code: 'db_error', message: error.message } }
  return { data: { id: (data as { id: string }).id }, error: null }
}
