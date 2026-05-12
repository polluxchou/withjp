import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/expense-saved-views — list current user's views, newest first
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const db = createServerClient()

  const { data, error } = await db
    .from('expense_saved_views')
    .select('id, name, filters, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/expense-saved-views — create a new view for the current user
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const db = createServerClient()
  const body = await req.json()
  const { name, filters } = body as { name?: string; filters?: Record<string, string> }

  if (!name || !name.trim()) {
    return NextResponse.json({ data: null, error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('expense_saved_views')
    .insert({
      user_id: user.id,
      name:    name.trim(),
      filters: filters ?? {},
    })
    .select('id, name, filters, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}
