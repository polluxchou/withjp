import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { executeAgent } from '@/lib/agents/executor'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: { id: string } }

// POST /api/agents/:id/execute
// Body: { task_id } — executes the agent on the specified pending task
export async function POST(req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const body = await req.json()
  const { task_id } = body

  if (!task_id) {
    return NextResponse.json({ data: null, error: 'task_id is required' }, { status: 400 })
  }

  // Verify the task belongs to this agent
  const db = createServerClient()
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .select('id, agent_id, status')
    .eq('id', task_id)
    .single()

  if (taskErr || !task) {
    return NextResponse.json({ data: null, error: 'Task not found' }, { status: 404 })
  }

  if (task.agent_id !== params.id) {
    return NextResponse.json({ data: null, error: 'Task is not assigned to this agent' }, { status: 403 })
  }

  if (task.status === 'running') {
    return NextResponse.json({ data: null, error: 'Task is already running' }, { status: 409 })
  }

  try {
    const result = await executeAgent(task_id)
    return NextResponse.json({ data: result, error: null })
  } catch (err) {
    await db.from('tasks').update({ status: 'failed' }).eq('id', task_id)
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 })
  }
}
