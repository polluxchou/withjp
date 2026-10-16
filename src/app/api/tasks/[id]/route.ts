import { NextRequest, NextResponse } from 'next/server'
import { forbidUnlessAdmin } from '@/lib/auth/require-admin'
import { createServerClient } from '@/lib/supabase/server'
import { executeAgent } from '@/lib/agents/executor'
import { authGuard } from '@/lib/auth/guard'
import { pickTaskManualUpdate } from '@/lib/tasks/manual-update'

type Params = { params: Promise<{ id: string }> }

// GET /api/tasks/:id
export async function GET(_req: NextRequest, props: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const params = await props.params
  const db = createServerClient()
  const { data, error } = await db
    .from('tasks')
    .select('*, creator:creators(id,name,platform,status), agent:agents(*)')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

// PATCH /api/tasks/:id — 仅管理员：手动改状态，或触发执行
// Body: { action: 'execute' } | { status?, next_action? }（其余字段 400，见 pickTaskManualUpdate）
export async function PATCH(req: NextRequest, props: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const denied = await forbidUnlessAdmin(user.id);
  if (denied) return denied;
  const params = await props.params
  const body = await req.json().catch(() => null)

  // Run AI agent execution（同 POST /api/agents/:id/execute：花 LLM 额度并改写产出）
  if (body?.action === 'execute') {
    try {
      const result = await executeAgent(params.id)
      return NextResponse.json({ data: result, error: null })
    } catch (err) {
      const db = createServerClient()
      await db.from('tasks').update({ status: 'failed' }).eq('id', params.id)
      return NextResponse.json({ data: null, error: String(err) }, { status: 500 })
    }
  }

  // Manual update — 只许改白名单字段
  const picked = pickTaskManualUpdate(body)
  if (!picked.ok) return NextResponse.json({ data: null, error: picked.error }, { status: 400 })
  const db = createServerClient()
  const { data, error } = await db
    .from('tasks')
    .update(picked.patch)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/tasks/:id — 仅管理员：连同 Agent 产出一起删掉，无法恢复
export async function DELETE(_req: NextRequest, props: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const denied = await forbidUnlessAdmin(user.id);
  if (denied) return denied;
  const params = await props.params
  const db = createServerClient()
  const { error } = await db.from('tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id }, error: null })
}
