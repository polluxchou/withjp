import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { STATUS_AGENT_ROLE, STATUS_TASK_TITLE } from '@/lib/state-machine/creator-lifecycle'
import { normalizeCreatorPlatform } from '@/lib/creators/platforms'
import { formatSupabaseError } from '@/lib/supabase/errors'
import { authGuard } from '@/lib/auth/guard'
import type { CreatorStatus } from '@/lib/types'

// GET /api/creators — list all creators with optional status filter
export async function GET(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const status = req.nextUrl.searchParams.get('status')

  let query = db
    .from('creators')
    .select('*, broadcast_account:broadcast_accounts(*), operator_user:users(id,name,email,user_code,role)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ data: null, error: formatSupabaseError(error.message) }, { status: 500 })
  }
  return NextResponse.json({ data, error: null })
}

// POST /api/creators — create a new creator
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    name,
    platform,
    contact_info,
    profile,
    notes,
    broadcast_account_id,
    operator_user_id,
  } = body
  const normalizedPlatform = typeof platform === 'string' && platform.trim()
    ? normalizeCreatorPlatform(platform.trim())
    : ''

  if (!name || !normalizedPlatform) {
    return NextResponse.json({ data: null, error: 'name and platform are required' }, { status: 400 })
  }

  // Create creator at 'prospect' status
  const { data: creator, error: createErr } = await db
    .from('creators')
    .insert({
      name,
      platform: normalizedPlatform,
      contact_info: contact_info ?? {},
      profile: profile ?? {},
      notes,
      broadcast_account_id:  broadcast_account_id || null,
      operator_user_id:      operator_user_id || null,
      created_by_user_id:    user.id,
    })
    .select('*, broadcast_account:broadcast_accounts(*), operator_user:users(id,name,email,user_code,role)')
    .single()

  if (createErr) {
    const isBroadcastConflict = createErr.code === '23505' && createErr.message.includes('idx_creators_broadcast_account_unique')
    return NextResponse.json({
      data: null,
      error: isBroadcastConflict
        ? 'This broadcast account is already linked to another creator'
        : formatSupabaseError(createErr.message),
    }, { status: isBroadcastConflict ? 409 : 500 })
  }

  // Auto-create outreach task for BD agent when creator is first added
  const agentRole = STATUS_AGENT_ROLE['contacted'] // BD agent
  const { data: agent } = await db
    .from('agents')
    .select('id')
    .eq('role', agentRole)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (agent) {
    await db.from('tasks').insert({
      creator_id: creator.id,
      agent_id:   agent.id,
      title:      STATUS_TASK_TITLE['contacted'] ?? 'Outreach task',
      status:     'pending',
      input:      { creator_id: creator.id, auto_generated: true, trigger: 'creator_created' },
    })
  }

  return NextResponse.json({ data: creator, error: null }, { status: 201 })
}
