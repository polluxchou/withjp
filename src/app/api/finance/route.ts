import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuardStrict } from '@/lib/auth/guard'
import { forbidUnlessAdmin } from '@/lib/auth/require-admin'
import { autoMonetizeOnRevenue } from '@/lib/state-machine/transition'

// GET /api/finance — list records, optionally filtered by creator
export async function GET(req: NextRequest) {
  const user = await authGuardStrict();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const creatorId = req.nextUrl.searchParams.get('creator_id')

  let query = db
    .from('finance')
    .select('*, creator:creators(id,name,platform)')
    .order('created_at', { ascending: false })

  if (creatorId) query = query.eq('creator_id', creatorId)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/finance — record revenue/cost for a creator. Admin only: these
// rows feed the dashboard's revenue/ROI totals, so any logged-in user being
// able to write them meant anyone could skew the numbers leadership reads.
export async function POST(req: NextRequest) {
  const user = await authGuardStrict();
  if (user instanceof NextResponse) return user;
  const denied = await forbidUnlessAdmin(user.id)
  if (denied) return denied
  const db = createServerClient()
  const body = await req.json()
  const { creator_id, revenue, cost, period, notes } = body

  if (!creator_id || revenue == null || cost == null || !period) {
    return NextResponse.json(
      { data: null, error: 'creator_id, revenue, cost, and period are required' },
      { status: 400 }
    )
  }

  const { data, error } = await db
    .from('finance')
    .insert({ creator_id, revenue: Number(revenue), cost: Number(cost), period, notes: notes ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

  // If the creator is 'live', auto-transition to 'monetized' on first revenue
  // entry. Called directly rather than over HTTP: the old server-side fetch to
  // the transition route used a relative URL (throws in Node) and carried no
  // session cookie, so this never took effect. Best-effort — the revenue row
  // is already written, so a failed transition is logged, not returned.
  const auto = await autoMonetizeOnRevenue(db, creator_id, Number(revenue))
  if (auto.error) console.error('Auto-transition to monetized failed:', auto.error)

  return NextResponse.json({ data, error: null }, { status: 201 })
}
