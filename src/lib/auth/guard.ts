import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

export async function authGuard() {
  const supabase = await createAuthServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return user
}
