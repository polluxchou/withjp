import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { executeAgent } from '@/lib/agents/executor'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: { id: string } }

// GET /api/tasks/:id
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const { data, error } = await db
    .from('tasks')
    .select('*, creator:creators(id,name,platform,status), agent:agents(*)')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

// PATCH /api/tasks/:id — update status, output, or trigger execution
// Body: { action: 'execute' } | { status, next_action }
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const body = await req.json()

  // Run AI agent execution
  if (body.action === 'execute') {
    try {
      const result = await executeAgent(params.id)
      return NextResponse.json({ data: result, error: null })
    } catch (err) {
      const db = createServerClient()
      await db.from('tasks').update({ status: 'failed' }).eq('id', params.id)
      return NextResponse.json({ data: null, error: String(err) }, { status: 500 })
    }
  }

  // Manual update
  const db = createServerClient()
  const { data, error } = await db
    .from('tasks')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/tasks/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const { error } = await db.from('tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id }, error: null })
}
