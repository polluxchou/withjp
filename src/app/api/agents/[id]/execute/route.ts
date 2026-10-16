import { NextRequest, NextResponse } from 'next/server'
import { forbidUnlessAdmin } from '@/lib/auth/require-admin'
import { createServerClient } from '@/lib/supabase/server'
import { executeAgent } from '@/lib/agents/executor'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: Promise<{ id: string }> }

// POST /api/agents/:id/execute
// Body: { task_id } — executes the agent on the specified pending task
// 仅管理员：会花 LLM 额度并改写 task 的状态与产出（同 PATCH /api/tasks/:id 的 execute）。
export async function POST(req: NextRequest, props: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const denied = await forbidUnlessAdmin(user.id);
  if (denied) return denied;
  const params = await props.params
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

  // 409 而非 403：403 只表示「不是管理员」，前端据此显示管理员文案。
  if (task.agent_id !== params.id) {
    return NextResponse.json({ data: null, error: 'Task is not assigned to this agent' }, { status: 409 })
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
