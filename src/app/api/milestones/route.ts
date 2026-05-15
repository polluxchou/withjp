import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateMilestoneTasks } from '@/lib/milestones/auto-tasks'
import { authGuard } from '@/lib/auth/guard'
import { AT_RISK_DAYS } from '@/lib/milestones/constants'
import type { Milestone } from '@/lib/types'

let lastSyncAt = 0
const SYNC_INTERVAL_MS = 60_000

// Auto-progress status for time-based transitions (throttled to once per minute).
async function syncStatusByTime(db: ReturnType<typeof createServerClient>) {
  const tick = Date.now()
  if (tick - lastSyncAt < SYNC_INTERVAL_MS) return
  lastSyncAt = tick
  const now          = new Date().toISOString()
  const weekFromNow  = new Date(Date.now() + AT_RISK_DAYS * 86400000).toISOString()

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

// GET /api/milestones
export async function GET(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  await syncStatusByTime(db)

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status')
  const type     = searchParams.get('type')
  const level    = searchParams.get('level')
  const priority = searchParams.get('priority')

  // eslint-disable-next-line
  let query = (db.from('milestones') as any)
    .select('*, owner_agent:agents!owner_agent_id(id, name, role)')
    .order('target_date', { ascending: true })

  if (status)   query = query.eq('status', status)
  if (type)     query = query.eq('type', type)
  if (level)    query = query.eq('level', level)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  const now = Date.now()
  const enriched = (data ?? []).map((m: Milestone) => ({
    ...m,
    days_until_target: Math.ceil(
      (new Date(m.target_date).getTime() - now) / 86400000
    ),
  }))

  return NextResponse.json({ data: enriched, error: null })
}

// POST /api/milestones
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db   = createServerClient()
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    title, description, type, level, priority, risk_level,
    owner_agent_id, involved_agent_ids, linked_creator_ids,
    parent_milestone_id, start_date, target_date,
    success_metric, notes,
  } = body

  if (!title || !type || !start_date || !target_date) {
    return NextResponse.json(
      { data: null, error: 'title, type, start_date, and target_date are required' },
      { status: 400 }
    )
  }

  const { data: milestone, error } = await db
    .from('milestones')
    .insert({
      title,
      description:         description ?? null,
      type,
      level:               level               ?? 'company',
      priority:            priority            ?? 'medium',
      risk_level:          risk_level          ?? 'low',
      owner_agent_id:      owner_agent_id      ?? null,
      involved_agent_ids:  involved_agent_ids  ?? [],
      linked_creator_ids:  linked_creator_ids  ?? [],
      parent_milestone_id: parent_milestone_id ?? null,
      start_date,
      target_date,
      success_metric:      success_metric      ?? {},
      notes:               notes               ?? null,
      created_by_user_id:  user.id,
    })
    .select('*, owner_agent:agents!owner_agent_id(id, name, role)')
    .single()

  if (error || !milestone) {
    return NextResponse.json(
      { data: null, error: error?.message ?? 'Insert failed' },
      { status: 500 }
    )
  }

  // Auto-generate tasks when owner + creators are set
  if (milestone.owner_agent_id && Array.isArray(linked_creator_ids) && linked_creator_ids.length > 0) {
    await generateMilestoneTasks(db, milestone as Milestone)
  }

  return NextResponse.json({ data: milestone, error: null }, { status: 201 })
}
