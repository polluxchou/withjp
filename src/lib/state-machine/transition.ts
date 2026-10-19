import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreatorStatus } from '@/lib/types'
import { canTransition, STATUS_AGENT_ROLE, STATUS_TASK_TITLE } from './creator-lifecycle.ts'

export interface TransitionInput {
  creatorId:   string
  toStatus:    CreatorStatus
  triggeredBy: string
  notes?:      string | null
}

export type TransitionResult =
  | { ok: true; creator: Record<string, unknown> }
  | { ok: false; status: 404 | 409 | 422 | 500; error: string }

// Move a creator to `toStatus`: validate against the state machine, update
// creators.status, record the transition (a DB trigger mirrors it into
// creator_activity_logs), then queue the follow-up task for the new status.
// Shared by POST /api/creators/:id/transition and server-side callers such as
// the revenue auto-transition, which must not go through HTTP — a server-side
// fetch has no session cookie and can't resolve a relative URL.
export async function transitionCreator(
  db: SupabaseClient,
  { creatorId, toStatus, triggeredBy, notes }: TransitionInput,
): Promise<TransitionResult> {
  const { data: creator, error: fetchErr } = await db
    .from('creators')
    .select('id, status')
    .eq('id', creatorId)
    .single()

  if (fetchErr || !creator) return { ok: false, status: 404, error: 'Creator not found' }

  const fromStatus = creator.status as CreatorStatus

  if (!canTransition(fromStatus, toStatus)) {
    return { ok: false, status: 422, error: `Invalid transition: ${fromStatus} → ${toStatus}` }
  }

  // Only update if the status is still what we validated against, so a
  // double-click or two concurrent revenue entries can't record the same
  // transition (and queue the same task) twice.
  const { data: updatedCreator, error: updateErr } = await db
    .from('creators')
    .update({ status: toStatus })
    .eq('id', creatorId)
    .eq('status', fromStatus)
    .select()
    .maybeSingle()

  if (updateErr) return { ok: false, status: 500, error: updateErr.message }
  if (!updatedCreator) {
    return { ok: false, status: 409, error: `Creator status changed concurrently (expected ${fromStatus})` }
  }

  const { error: logErr } = await db.from('lifecycle_transitions').insert({
    creator_id:   creatorId,
    from_status:  fromStatus,
    to_status:    toStatus,
    triggered_by: triggeredBy,
    notes:        notes ?? null,
  })
  if (logErr) console.error('Failed to record lifecycle transition:', logErr.message)

  // Auto-generate task for the new status
  const agentRole = STATUS_AGENT_ROLE[toStatus]
  const taskTitle = STATUS_TASK_TITLE[toStatus]

  if (agentRole && taskTitle) {
    const { data: agent } = await db
      .from('agents')
      .select('id')
      .eq('role', agentRole)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (agent) {
      // Find the most recent done task to chain
      const { data: prevTask } = await db
        .from('tasks')
        .select('id')
        .eq('creator_id', creatorId)
        .eq('status', 'done')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      await db.from('tasks').insert({
        creator_id:     creatorId,
        agent_id:       agent.id,
        title:          taskTitle,
        status:         'pending',
        input:          { creator_id: creatorId, trigger: `transition_${fromStatus}_to_${toStatus}` },
        parent_task_id: prevTask?.id ?? null,
      })
    }
  }

  return { ok: true, creator: updatedCreator }
}

// Recording revenue for a creator who is 'live' moves them to 'monetized'.
// Any other status, or revenue <= 0, is a no-op rather than an error.
export async function autoMonetizeOnRevenue(
  db: SupabaseClient,
  creatorId: string,
  revenue: number,
): Promise<{ transitioned: boolean; error: string | null }> {
  if (!(revenue > 0)) return { transitioned: false, error: null }

  const { data: creator } = await db
    .from('creators')
    .select('status')
    .eq('id', creatorId)
    .single()

  if (creator?.status !== 'live') return { transitioned: false, error: null }

  const result = await transitionCreator(db, {
    creatorId,
    toStatus:    'monetized',
    triggeredBy: 'system',
    notes:       'Revenue recorded',
  })
  return result.ok ? { transitioned: true, error: null } : { transitioned: false, error: result.error }
}
