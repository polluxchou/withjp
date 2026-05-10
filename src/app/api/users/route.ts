import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authGuard } from '@/lib/auth/guard'
import { formatSupabaseError } from '@/lib/supabase/errors'

// GET /api/users — list WithJP user profiles for operator assignment
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const db = createServerClient()
  const { data, error } = await db
    .from('users')
    .select('id,name,role,email,user_code')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ data: null, error: formatSupabaseError(error.message) }, { status: 500 })
  }

  return NextResponse.json({ data, error: null })
}
