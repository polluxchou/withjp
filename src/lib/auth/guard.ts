import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { authedUserFromClaims, authedUserFromUser, type AuthedUser } from '@/lib/auth/claims'

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

export async function authGuard(): Promise<AuthedUser | NextResponse> {
  const supabase = await createAuthServerClient()
  // getClaims() verifies the access-token JWT locally against the cached JWKS
  // when the project signs with an asymmetric key (ES256 here) — no per-request
  // round-trip to the Auth server. Legacy HS256 tokens fall back to a getUser()
  // network check inside getClaims(). Trade-off: a revoked session / deleted
  // user is only rejected once the access token expires (it can't be refreshed).
  // Sensitive routes use authGuardStrict() below instead.
  const { data, error } = await supabase.auth.getClaims()
  const user = error ? null : authedUserFromClaims(data?.claims)

  return user ?? unauthorized()
}

// For sensitive routes (salary, finance & expenses, people & permissions,
// public-site writes): getUser() asks the Auth server on every request, so a
// signed-out session or a deleted user is rejected on the very next request
// instead of when the access token expires. Costs one network round-trip.
export async function authGuardStrict(): Promise<AuthedUser | NextResponse> {
  const supabase = await createAuthServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return (error ? null : authedUserFromUser(user)) ?? unauthorized()
}
