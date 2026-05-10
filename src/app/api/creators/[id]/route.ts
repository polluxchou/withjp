import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { normalizeCreatorPlatform } from '@/lib/creators/platforms'
import { authGuard } from '@/lib/auth/guard'
import { formatSupabaseError } from '@/lib/supabase/errors'

type Params = { params: { id: string } }

// GET /api/creators/:id — full creator detail with tasks and finance
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()

  const [creatorRes, tasksRes, financeRes, transitionsRes, activityLogsRes] = await Promise.all([
    db.from('creators')
      .select('*, broadcast_account:broadcast_accounts(*), operator_user:users(id,name,email,user_code,role)')
      .eq('id', params.id)
      .single(),
    db.from('tasks').select('*, agent:agents(id,name,role)').eq('creator_id', params.id).order('created_at', { ascending: false }),
    db.from('finance').select('*').eq('creator_id', params.id).order('created_at', { ascending: false }),
    db.from('lifecycle_transitions').select('*').eq('creator_id', params.id).order('triggered_at', { ascending: true }),
    db.from('creator_activity_logs').select('*').eq('creator_id', params.id).order('created_at', { ascending: false }).limit(100),
  ])

  if (creatorRes.error) {
    return NextResponse.json({ data: null, error: creatorRes.error.message }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      ...creatorRes.data,
      tasks:        tasksRes.data ?? [],
      finance:      financeRes.data ?? [],
      transitions:  transitionsRes.data ?? [],
      activity_logs: activityLogsRes.data ?? [],
    },
    error: null,
  })
}

// PATCH /api/creators/:id — update creator fields (not status — use /transition)
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()

  // Prevent direct status changes via PATCH; use /transition endpoint
  const { status: _removed, broadcast_account, operator_user, tasks, finance, transitions, activity_logs, ...updates } = body
  const normalizedUpdates = { ...updates }

  if ('platform' in normalizedUpdates) {
    const normalizedPlatform = typeof normalizedUpdates.platform === 'string'
      ? normalizeCreatorPlatform(normalizedUpdates.platform)
      : ''

    if (!normalizedPlatform) {
      return NextResponse.json({ data: null, error: 'name and platform are required' }, { status: 400 })
    }

    normalizedUpdates.platform = normalizedPlatform
  }

  if ('broadcast_account_id' in normalizedUpdates && !normalizedUpdates.broadcast_account_id) {
    normalizedUpdates.broadcast_account_id = null
  }

  if ('operator_user_id' in normalizedUpdates && !normalizedUpdates.operator_user_id) {
    normalizedUpdates.operator_user_id = null
  }

  const { data, error } = await db
    .from('creators')
    .update(normalizedUpdates)
    .eq('id', params.id)
    .select('*, broadcast_account:broadcast_accounts(*), operator_user:users(id,name,email,user_code,role)')
    .single()

  if (error) {
    const isBroadcastConflict = error.code === '23505' && error.message.includes('idx_creators_broadcast_account_unique')
    return NextResponse.json({
      data: null,
      error: isBroadcastConflict
        ? 'This broadcast account is already linked to another creator'
        : formatSupabaseError(error.message),
    }, { status: isBroadcastConflict ? 409 : 500 })
  }
  return NextResponse.json({ data, error: null })
}

// DELETE /api/creators/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const { error } = await db.from('creators').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id }, error: null })
}
