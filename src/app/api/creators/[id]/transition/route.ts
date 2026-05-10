import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  canTransition,
  STATUS_AGENT_ROLE,
  STATUS_TASK_TITLE,
} from '@/lib/state-machine/creator-lifecycle'
import { authGuard } from '@/lib/auth/guard'
import type { CreatorStatus } from '@/lib/types'

type Params = { params: { id: string } }

// POST /api/creators/:id/transition
// Body: { to_status, triggered_by?, notes? }
export async function POST(req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()
  const { to_status, triggered_by = 'user', notes } = body as {
    to_status: CreatorStatus
    triggered_by?: string
    notes?: string
  }

  if (!to_status) {
    return NextResponse.json({ data: null, error: 'to_status is required' }, { status: 400 })
  }

  // Load current creator
  const { data: creator, error: fetchErr } = await db
    .from('creators')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (fetchErr || !creator) {
    return NextResponse.json({ data: null, error: 'Creator not found' }, { status: 404 })
  }

  const from_status = creator.status as CreatorStatus

  if (!canTransition(from_status, to_status)) {
    return NextResponse.json(
      { data: null, error: `Invalid transition: ${from_status} → ${to_status}` },
      { status: 422 }
    )
  }

  // Update creator status
  const { data: updatedCreator, error: updateErr } = await db
    .from('creators')
    .update({ status: to_status })
    .eq('id', params.id)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ data: null, error: updateErr.message }, { status: 500 })

  // Record transition
  await db.from('lifecycle_transitions').insert({
    creator_id: params.id,
    from_status,
    to_status,
    triggered_by,
    notes: notes ?? null,
  })

  // Auto-generate task for the new status
  const agentRole = STATUS_AGENT_ROLE[to_status]
  const taskTitle = STATUS_TASK_TITLE[to_status]

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
        .eq('creator_id', params.id)
        .eq('status', 'done')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      await db.from('tasks').insert({
        creator_id:     params.id,
        agent_id:       agent.id,
        title:          taskTitle,
        status:         'pending',
        input:          { creator_id: params.id, trigger: `transition_${from_status}_to_${to_status}` },
        parent_task_id: prevTask?.id ?? null,
      })
    }
  }

  return NextResponse.json({ data: updatedCreator, error: null })
}
