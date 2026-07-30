import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateMilestoneTasks } from '@/lib/milestones/auto-tasks'
import { authGuard } from '@/lib/auth/guard'
import { listMilestones } from '@/lib/milestones/list'
import type { Milestone } from '@/lib/types'

// GET /api/milestones
export async function GET(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url)
  const { data, error } = await listMilestones({
    status:   searchParams.get('status'),
    type:     searchParams.get('type'),
    level:    searchParams.get('level'),
    priority: searchParams.get('priority'),
  })

  if (error) return NextResponse.json({ data: null, error }, { status: 500 })
  return NextResponse.json({ data, error: null })
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
