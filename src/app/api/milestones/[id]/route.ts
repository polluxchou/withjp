import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile, canModify } from '@/lib/auth/actor'

type Params = { params: { id: string } }

// GET /api/milestones/:id — full detail with linked entities
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()

  const { data: milestone, error } = await db
    .from('milestones')
    .select(`
      *,
      owner_agent:agents!owner_agent_id(id, name, role),
      children:milestones!parent_milestone_id(id, title, type, status, priority, start_date, target_date)
    `)
    .eq('id', params.id)
    .single()

  if (error || !milestone) {
    return NextResponse.json({ data: null, error: 'Milestone not found' }, { status: 404 })
  }

  // Involved agents
  let involved_agents: unknown[] = []
  if (milestone.involved_agent_ids?.length) {
    const { data } = await db
      .from('agents')
      .select('id, name, role')
      .in('id', milestone.involved_agent_ids)
    involved_agents = data ?? []
  }

  // Linked tasks (with creator + agent names)
  let linked_tasks: unknown[] = []
  let task_progress = { done: 0, total: 0 }
  if (milestone.linked_task_ids?.length) {
    const { data } = await db
      .from('tasks')
      .select('id, title, status, creator:creators(id, name), agent:agents(id, name, role)')
      .in('id', milestone.linked_task_ids)
    linked_tasks = data ?? []
    task_progress = {
      done:  (data ?? []).filter((t: { status: string }) => t.status === 'done').length,
      total: (data ?? []).length,
    }
  }

  // Linked creators
  let linked_creators: unknown[] = []
  if (milestone.linked_creator_ids?.length) {
    const { data } = await db
      .from('creators')
      .select('id, name, platform, status')
      .in('id', milestone.linked_creator_ids)
    linked_creators = data ?? []
  }

  const now = Date.now()

  return NextResponse.json({
    data: {
      ...milestone,
      involved_agents,
      linked_tasks,
      linked_creators,
      task_progress,
      days_until_target: Math.ceil(
        (new Date(milestone.target_date).getTime() - now) / 86400000
      ),
    },
    error: null,
  })
}

// PATCH /api/milestones/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()

  const actor = await getActorProfile(user.id)
  if (!actor?.is_admin) {
    const { data: existing } = await db
      .from('milestones')
      .select('created_by_user_id')
      .eq('id', params.id)
      .single()
    if (!canModify(actor, existing?.created_by_user_id ?? null)) {
      return NextResponse.json({ data: null, error: '权限不足：只能编辑自己创建的条目' }, { status: 403 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const ALLOWED = [
    'title', 'description', 'type', 'level', 'priority', 'status', 'risk_level',
    'owner_agent_id', 'involved_agent_ids', 'linked_creator_ids', 'linked_task_ids',
    'parent_milestone_id', 'start_date', 'target_date', 'success_metric', 'notes',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key] ?? null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ data: null, error: 'No valid fields to update' }, { status: 400 })
  }

  const startDate  = (updates.start_date  ?? null) as string | null
  const targetDate = (updates.target_date ?? null) as string | null
  if (startDate && targetDate && new Date(startDate) >= new Date(targetDate)) {
    return NextResponse.json(
      { data: null, error: 'Target date must be after start date.' },
      { status: 400 },
    )
  }

  const { data, error } = await db
    .from('milestones')
    .update(updates)
    .eq('id', params.id)
    .select('*, owner_agent:agents!owner_agent_id(id, name, role)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/milestones/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()

  const actor = await getActorProfile(user.id)
  if (!actor?.is_admin) {
    const { data: existing } = await db
      .from('milestones')
      .select('created_by_user_id')
      .eq('id', params.id)
      .single()
    if (!canModify(actor, existing?.created_by_user_id ?? null)) {
      return NextResponse.json({ data: null, error: '权限不足：只能删除自己创建的条目' }, { status: 403 })
    }
  }

  const { error } = await db.from('milestones').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { deleted: true }, error: null })
}
