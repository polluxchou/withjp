export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/conversations — list conversations, optionally filtered by agent
export async function GET(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const agentId = req.nextUrl.searchParams.get('agent_id')

  let query = db
    .from('conversations')
    .select('*, agent:agents(id,name,role)')
    .order('updated_at', { ascending: false })

  if (agentId) query = query.eq('agent_id', agentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/conversations — create a new conversation for a given agent
// Body: { agent_id, title? }
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()
  const { agent_id, title } = body

  if (!agent_id) {
    return NextResponse.json({ data: null, error: 'agent_id is required' }, { status: 400 })
  }

  // Verify agent exists and is chat-enabled
  const { data: agent, error: agentErr } = await db
    .from('agents')
    .select('id, name, chat_enabled')
    .eq('id', agent_id)
    .single()

  if (agentErr || !agent) {
    return NextResponse.json({ data: null, error: 'Agent not found' }, { status: 404 })
  }

  if (!agent.chat_enabled) {
    return NextResponse.json({ data: null, error: 'This agent is not chat-enabled' }, { status: 403 })
  }

  const { data: conversation, error } = await db
    .from('conversations')
    .insert({ agent_id, title: title ?? null })
    .select('*, agent:agents(id,name,role)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: conversation, error: null }, { status: 201 })
}
