import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

// The subset of the Supabase user shape that API routes actually read.
export type AuthedUser = {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}

export async function authGuard(): Promise<AuthedUser | NextResponse> {
  const supabase = await createAuthServerClient()
  // getClaims() verifies the access-token JWT LOCALLY via a cached JWKS when the
  // project uses asymmetric signing keys (no network round-trip), and falls back
  // to a getUser() network check for legacy HS256 secrets — so it is never less
  // secure than getUser(), and much faster once signing keys are enabled.
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { claims } = data
  return {
    id: claims.sub,
    email: claims.email,
    user_metadata: claims.user_metadata,
  }
}
