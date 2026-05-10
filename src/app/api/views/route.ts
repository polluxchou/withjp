import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import { applyPing, type ViewSession } from '@/lib/views/session'
import type { ActivityEntity } from '@/lib/types'

const VALID_ENTITIES: readonly ActivityEntity[] = [
  'creator', 'task', 'milestone', 'finance', 'device',
  'conversation', 'broadcast_account', 'user', 'knowledge', 'agent',
] as const

// POST /api/views — record a read-behavior ping.
// Body: { entity_type?, entity_id?, route }
//
// Either folds the ping into the user's most recent open session (gap ≤ 30min)
// or opens a new session row. See src/lib/views/session.ts.
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { entity_type?: string; entity_id?: string; route?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'invalid json body' }, { status: 400 })
  }

  const route = typeof body.route === 'string' ? body.route.slice(0, 500) : ''
  if (!route) {
    return NextResponse.json({ data: null, error: 'route is required' }, { status: 400 })
  }

  const entity_type =
    body.entity_type && VALID_ENTITIES.includes(body.entity_type as ActivityEntity)
      ? (body.entity_type as ActivityEntity)
      : null
  const entity_id = entity_type && typeof body.entity_id === 'string' ? body.entity_id : null

  const db = createServerClient()
  const now = new Date()

  // Find the user's most recent session that's still inside the 30-min window.
  const { data: openRow } = await db
    .from('view_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const open: ViewSession | null = openRow as ViewSession | null

  const { session, isNew } = applyPing(open, {
    user_id: user.id,
    entity_type,
    entity_id,
    route,
    at: now,
  })

  if (isNew) {
    const { data, error } = await db
      .from('view_sessions')
      .insert({
        user_id:    session.user_id,
        started_at: session.started_at,
        ended_at:   session.ended_at,
        views:      session.views,
        routes:     session.routes,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data: { session_id: data.id, opened: true }, error: null }, { status: 201 })
  }

  const { error } = await db
    .from('view_sessions')
    .update({
      ended_at: session.ended_at,
      views:    session.views,
      routes:   session.routes,
    })
    .eq('id', openRow!.id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data: { session_id: openRow!.id, opened: false }, error: null })
}
