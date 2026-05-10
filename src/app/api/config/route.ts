import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'

// GET /api/config
export async function GET() {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const { data, error } = await db.from('config').select('*').order('key')
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}

// PATCH /api/config — upsert a config entry
export async function PATCH(req: NextRequest) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const db = createServerClient()
  const body = await req.json()
  const { key, value, description } = body

  if (!key || value == null) {
    return NextResponse.json({ data: null, error: 'key and value are required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('config')
    .upsert({ key, value, description: description ?? '', updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
    .single()

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  return NextResponse.json({ data, error: null })
}
