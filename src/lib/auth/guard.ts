import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { authedUserFromClaims, type AuthedUser } from '@/lib/auth/claims'

export async function authGuard(): Promise<AuthedUser | NextResponse> {
  const supabase = await createAuthServerClient()
  // getClaims() verifies the access-token JWT locally against the cached JWKS
  // when the project signs with an asymmetric key (ES256 here) — no per-request
  // round-trip to the Auth server. Legacy HS256 tokens fall back to a getUser()
  // network check inside getClaims(). Trade-off: a revoked session / deleted
  // user is only rejected once the access token expires (it can't be refreshed).
  const { data, error } = await supabase.auth.getClaims()
  const user = error ? null : authedUserFromClaims(data?.claims)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return user
}
