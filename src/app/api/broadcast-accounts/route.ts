import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { normalizeCreatorPlatform } from '@/lib/creators/platforms'
import { authGuard } from '@/lib/auth/guard'
import { formatSupabaseError } from '@/lib/supabase/errors'

// GET /api/broadcast-accounts — list all reusable broadcast accounts
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()
  const { data, error } = await db
    .from('broadcast_accounts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ data: null, error: formatSupabaseError(error.message) }, { status: 500 })
  }

  return NextResponse.json({ data, error: null })
}

// POST /api/broadcast-accounts — create a broadcast account
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()
  const body = await req.json()
  const { name, platform, account_handle, account_url, notes } = body
  const normalizedPlatform = typeof platform === 'string' ? normalizeCreatorPlatform(platform) : ''

  if (!name || !normalizedPlatform || !account_handle) {
    return NextResponse.json(
      { data: null, error: 'name, platform, and account_handle are required' },
      { status: 400 },
    )
  }

  const { data, error } = await db
    .from('broadcast_accounts')
    .insert({
      name,
      platform: normalizedPlatform,
      account_handle,
      account_url: account_url || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    const isDuplicate = error.code === '23505'
    return NextResponse.json({
      data: null,
      error: isDuplicate ? 'This broadcast account already exists' : formatSupabaseError(error.message),
    }, { status: isDuplicate ? 409 : 500 })
  }

  return NextResponse.json({ data, error: null }, { status: 201 })
}
