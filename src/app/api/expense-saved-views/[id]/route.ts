import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

type Params = { params: { id: string } }

// PATCH /api/expense-saved-views/[id] — rename or overwrite filters
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const db = createServerClient()
  const body = await req.json()
  const { name, filters } = body as { name?: string; filters?: Record<string, string> }

  const patch: Record<string, unknown> = {}
  if (typeof name === 'string') {
    if (!name.trim()) {
      return NextResponse.json({ data: null, error: 'name cannot be empty' }, { status: 400 })
    }
    patch.name = name.trim()
  }
  if (filters && typeof filters === 'object') patch.filters = filters

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ data: null, error: 'no fields to update' }, { status: 400 })
  }

  const { data, error } = await db
    .from('expense_saved_views')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id, name, filters, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ data: null, error: 'not found' }, { status: 404 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/expense-saved-views/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const db = createServerClient()

  const { error } = await db
    .from('expense_saved_views')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: null, error: null })
}
