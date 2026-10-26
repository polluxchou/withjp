import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard, authGuardStrict } from '@/lib/auth/guard'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'
import type { AgentRole } from '@/lib/types'

// GET /api/profile - Get current user profile
export async function GET() {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
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

    return NextResponse.json({ data: { ...createdProfile, access_scope: user.access_scope }, error: null })
  }

  // access_scope 不在 users 表里，来自 Auth 的 app_metadata（见 access-scope.ts），前端据此收起导航与删除入口。
  return NextResponse.json({ data: { ...profile, access_scope: user.access_scope }, error: null })
}

// PATCH /api/profile - Update current user profile
// Strict: this can change the caller's own role, so a revoked session must not
// get through on a still-unexpired access token.
export async function PATCH(req: NextRequest) {
  const user = await authGuardStrict({ allowScope: COMPETITORS_SCOPE })
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

  // Validate role — real-user selectable roles only: the 6 depts + 'tech'
  // (真人技术岗，对齐 ProfileEditor 的 ROLES 下拉). 'pmo' 刻意不在这里——它是
  // AI 代理专属角色（PMO Agent 自身的 role），这个校验数组正是拦住真人用户
  // 把自己 profile.role 改成 pmo 的关口，不能放开。
  const validRoles: AgentRole[] = ['bd', 'ops', 'finance', 'content', 'growth', 'legal', 'tech']
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
