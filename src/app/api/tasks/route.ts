import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/tasks — list tasks with optional filters
export async function GET(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const { searchParams } = req.nextUrl
  const creatorId = searchParams.get('creator_id')
  const status    = searchParams.get('status')
  const agentId   = searchParams.get('agent_id')

  let query = db
    .from('tasks')
    .select('*, creator:creators(id,name,platform,status), agent:agents(id,name,role)')
    .order('created_at', { ascending: false })

  if (creatorId) query = query.eq('creator_id', creatorId)
  if (status)    query = query.eq('status', status)
  if (agentId)   query = query.eq('agent_id', agentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/tasks — create a task manually
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()
  const { creator_id, agent_id, title, input, parent_task_id } = body

  if (!creator_id || !agent_id || !title) {
    return NextResponse.json(
      { data: null, error: 'creator_id, agent_id, and title are required' },
      { status: 400 }
    )
  }

  const { data, error } = await db
    .from('tasks')
    .insert({ creator_id, agent_id, title, input: input ?? {}, parent_task_id: parent_task_id ?? null })
    .select('*, creator:creators(id,name,platform,status), agent:agents(id,name,role)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
