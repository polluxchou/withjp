import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/knowledge — list with optional category filter
export async function GET(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const category = req.nextUrl.searchParams.get('category')

  let query = db.from('knowledge').select('*').order('category').order('title')
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// POST /api/knowledge
export async function POST(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()
  const { category, title, content, tags } = body

  if (!category || !title || !content) {
    return NextResponse.json(
      { data: null, error: 'category, title, and content are required' },
      { status: 400 }
    )
  }

  const { data, error } = await db
    .from('knowledge')
    .insert({ category, title, content, tags: tags ?? [] })
    .select()
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null }, { status: 201 })
}

// PATCH /api/knowledge — update by id (passed in body for simplicity)
export async function PATCH(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ data: null, error: 'id is required' }, { status: 400 })

  const { data, error } = await db.from('knowledge').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// DELETE /api/knowledge?id=...
export async function DELETE(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ data: null, error: 'id is required' }, { status: 400 })

  const { error } = await db.from('knowledge').delete().eq('id', id)
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id }, error: null })
}
