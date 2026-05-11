import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: { id: string } }

// PATCH /api/user-salary/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db   = createServerClient()
  const body = await req.json()
  const { id: _id, created_at: _ca, user: _u, ...updates } = body

  if ('monthly_salary' in updates && Number(updates.monthly_salary) < 0) {
    return NextResponse.json({ data: null, error: 'monthly_salary must be ≥ 0' }, { status: 400 })
  }

  const { data, error } = await db
    .from('user_salary')
    .update(updates)
    .eq('id', params.id)
    .select('*, user:users(id,name,user_code,role)')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/user-salary/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()
  const { error } = await db.from('user_salary').delete().eq('id', params.id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id }, error: null })
}
