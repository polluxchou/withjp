export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { executeChatMessage } from '@/lib/conversation/chat-executor'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: { id: string } }

// GET /api/conversations/:id/messages — load all messages for a conversation
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()

  const { data, error } = await db
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/conversations/:id/messages — send a user message and receive agent reply
// Body: { content: string }
export async function POST(req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const body = await req.json()
  const { content } = body

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ data: null, error: 'content is required' }, { status: 400 })
  }

  try {
    const result = await executeChatMessage(params.id, content.trim())
    return NextResponse.json({ data: result, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
