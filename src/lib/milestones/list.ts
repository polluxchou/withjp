import { createServerClient } from '@/lib/supabase/server'
import { AT_RISK_DAYS } from '@/lib/milestones/constants'
import type { Milestone } from '@/lib/types'

// Shared read path for milestones, used by both the /api/milestones route and
// the server-rendered timeline page so status auto-progression and the
// days_until_target enrichment stay in one place (and share one throttle).

let lastSyncAt = 0
const SYNC_INTERVAL_MS = 60_000

// Auto-progress status for time-based transitions (throttled to once per minute
// process-wide). Statuses are stored columns; this keeps them current so
// filtering by status — server-side or in memory — is accurate.
async function syncStatusByTime(db: ReturnType<typeof createServerClient>) {
  const tick = Date.now()
  if (tick - lastSyncAt < SYNC_INTERVAL_MS) return
  lastSyncAt = tick
  const now         = new Date().toISOString()
  const weekFromNow = new Date(Date.now() + AT_RISK_DAYS * 86400000).toISOString()

  await Promise.all([
    // Overdue → missed
    db.from('milestones')
      .update({ status: 'missed' })
      .in('status', ['planned', 'active', 'at_risk'])
      .lt('target_date', now),
    // Approaching within 7 days → at_risk
    db.from('milestones')
      .update({ status: 'at_risk' })
      .in('status', ['planned', 'active'])
      .gte('target_date', now)
      .lt('target_date', weekFromNow),
  ])
}

export interface ListMilestonesFilters {
  status?:   string | null
  type?:     string | null
  level?:    string | null
  priority?: string | null
}

export interface ListMilestonesResult {
  data:  Milestone[] | null
  error: string | null
}

export async function listMilestones(
  filters: ListMilestonesFilters = {},
): Promise<ListMilestonesResult> {
  const db = createServerClient()
  await syncStatusByTime(db)

  // eslint-disable-next-line
  let query = (db.from('milestones') as any)
    .select('*, owner_agent:agents!owner_agent_id(id, name, role)')
    .order('target_date', { ascending: true })

  if (filters.status)   query = query.eq('status', filters.status)
  if (filters.type)     query = query.eq('type', filters.type)
  if (filters.level)    query = query.eq('level', filters.level)
  if (filters.priority) query = query.eq('priority', filters.priority)

  const { data, error } = await query
  if (error) return { data: null, error: error.message }

  const now = Date.now()
  const enriched = ((data ?? []) as Milestone[]).map((m) => ({
    ...m,
    days_until_target: Math.ceil((new Date(m.target_date).getTime() - now) / 86400000),
  }))

  return { data: enriched, error: null }
}
