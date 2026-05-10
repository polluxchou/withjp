import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import type { AgentRole } from '@/lib/types'

// GET /api/profile - Get current user profile
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const db = createServerClient()

  const { data: profile, error } = await db
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  if (!profile) {
    const fallbackName = user.user_metadata?.name || user.email?.split('@')[0] || 'WithJP User'
    const { data: createdProfile, error: createError } = await db
      .from('users')
      .insert({
        id: user.id,
        name: fallbackName,
        role: 'ops',
        email: user.email ?? null,
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json({ data: null, error: createError.message }, { status: 500 })
    }

    return NextResponse.json({ data: createdProfile, error: null })
  }

  return NextResponse.json({ data: profile, error: null })
}

// PATCH /api/profile - Update current user profile
export async function PATCH(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const db = createServerClient()

  const body = await req.json()
  const { name, role } = body as { name?: string; role?: AgentRole }

  // Validate name length
  if (name && name.length > 30) {
    return NextResponse.json(
      { data: null, error: 'Name must not exceed 30 characters' },
      { status: 400 }
    )
  }

  // Validate role
  const validRoles: AgentRole[] = ['bd', 'ops', 'finance', 'content', 'growth', 'legal']
  if (role && !validRoles.includes(role)) {
    return NextResponse.json(
      { data: null, error: 'Invalid role' },
      { status: 400 }
    )
  }

  const updates: { name?: string; role?: AgentRole; email?: string | null } = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role
  updates.email = user.email ?? null

  const { data: profile, error } = await db
    .from('users')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: profile, error: null })
}
