import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/finance — list records, optionally filtered by creator
export async function GET(req: NextRequest) {
  const user = await authGuard();
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

// POST /api/finance — record revenue/cost for a creator
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
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

  // If the creator is 'live', auto-transition to 'monetized' on first revenue entry
  const { data: creator } = await db
    .from('creators')
    .select('status')
    .eq('id', creator_id)
    .single()

  if (creator?.status === 'live' && Number(revenue) > 0) {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3000'}/api/creators/${creator_id}/transition`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: 'monetized', triggered_by: 'system', notes: 'Revenue recorded' }),
      }
    ).catch(() => null) // best-effort
  }

  return NextResponse.json({ data, error: null }, { status: 201 })
}
