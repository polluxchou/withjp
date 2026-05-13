import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import { createServerClient } from '@/lib/supabase/server'

// GET /api/admin/intent-violations?limit=50&stage=cross_check&since=2026-05-01
//
// Admin-only. Returns recent intent-pipeline rejections with simple counts
// per stage and per user — enough to spot a spike without standing up a
// separate dashboard. Power-users can slice the underlying table directly in
// Supabase; this endpoint exists so the audit signal is reachable without
// shell/SQL access during an incident.
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url   = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 500)
  const stage = url.searchParams.get('stage')
  const since = url.searchParams.get('since')

  const db = createServerClient()
  let q = db.from('intent_violations')
    .select('id, user_id, channel, stage, reason, raw_text, intent_json, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (stage)  q = q.eq('stage', stage)
  if (since)  q = q.gte('created_at', since)

  const { data: rows, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Cheap aggregates over the same window: by stage and by user.
  const byStage: Record<string, number> = {}
  const byUser:  Record<string, number> = {}
  for (const r of rows ?? []) {
    byStage[r.stage] = (byStage[r.stage] ?? 0) + 1
    const uid = r.user_id ?? 'anonymous'
    byUser[uid] = (byUser[uid] ?? 0) + 1
  }

  return NextResponse.json({
    data: {
      total: rows?.length ?? 0,
      byStage,
      byUser,
      rows,
    },
    error: null,
  })
}
