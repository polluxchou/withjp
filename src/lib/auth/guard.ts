import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { authedUserFromClaims, authedUserFromUser, type AuthedUser } from '@/lib/auth/claims'
import { scopeAllows, type AccessArea } from '@/lib/auth/access-scope'

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => NextResponse.json({ data: null, error: 'Forbidden' }, { status: 403 })

// 受限帐号（app_metadata.access_scope，见 access-scope.ts）默认处处 403：
// 只有显式写了 { allowScope } 的路由才放它进来。这样新加的接口不用记得防它，
// 忘了接线的结果是「受限帐号用不了」，而不是「受限帐号看得到」。
export interface GuardOptions {
  allowScope?: AccessArea
}

function scoped(user: AuthedUser | null, opts: GuardOptions | undefined): AuthedUser | NextResponse {
  if (!user) return unauthorized()
  return scopeAllows(user.access_scope, opts?.allowScope) ? user : forbidden()
}

export async function authGuard(opts?: GuardOptions): Promise<AuthedUser | NextResponse> {
  const supabase = await createAuthServerClient()
  // getClaims() verifies the access-token JWT locally against the cached JWKS
  // when the project signs with an asymmetric key (ES256 here) — no per-request
  // round-trip to the Auth server. Legacy HS256 tokens fall back to a getUser()
  // network check inside getClaims(). Trade-off: a revoked session / deleted
  // user is only rejected once the access token expires (it can't be refreshed).
  // Sensitive routes use authGuardStrict() below instead.
  const { data, error } = await supabase.auth.getClaims()
  const user = error ? null : authedUserFromClaims(data?.claims)

  return scoped(user, opts)
}

// For sensitive routes (salary, finance & expenses, people & permissions,
// public-site writes): getUser() asks the Auth server on every request, so a
// signed-out session or a deleted user is rejected on the very next request
// instead of when the access token expires. Costs one network round-trip.
export async function authGuardStrict(opts?: GuardOptions): Promise<AuthedUser | NextResponse> {
  const supabase = await createAuthServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return scoped(error ? null : authedUserFromUser(user), opts)
}
