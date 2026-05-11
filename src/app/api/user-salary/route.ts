import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/user-salary  — list all salary records (joined with user)
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db      = createServerClient()
  const userId  = req.nextUrl.searchParams.get('user_id')
  const current = req.nextUrl.searchParams.get('current')  // 'true' = only active records

  let query = db
    .from('user_salary')
    .select('*, user:users(id, name, user_code, role)')
    .order('effective_from', { ascending: false })

  if (userId)           query = query.eq('user_id', userId)
  if (current === 'true') query = query.is('effective_to', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/user-salary  — create a salary record
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()
  const { user_id, monthly_salary, effective_from, effective_to, notes } = body

  if (!user_id || monthly_salary == null || !effective_from) {
    return NextResponse.json(
      { data: null, error: 'user_id, monthly_salary, and effective_from are required' },
      { status: 400 }
    )
  }
  if (Number(monthly_salary) < 0) {
    return NextResponse.json({ data: null, error: 'monthly_salary must be ≥ 0' }, { status: 400 })
  }

  const { data, error } = await db
    .from('user_salary')
    .insert({
      user_id,
      monthly_salary: Number(monthly_salary),
      effective_from,
      effective_to:   effective_to ?? null,
      notes:          notes ?? null,
    })
    .select('*, user:users(id,name,user_code,role)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
