import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { resolveCallbackRedirect, isResetPasswordPath } from '@/lib/auth/reset-redirect'
import { createRecoveryProof } from '@/lib/auth/recovery-proof'
import { defaultLocale } from '@/i18n/routing'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next')

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const target = resolveCallbackRedirect(next)
      const destination = new URL(target, url.origin)
      // Only attach the short-lived recovery-proof token when we're actually
      // sending the user to /reset-password — resolveCallbackRedirect allows
      // any same-site path (open-redirect protection, not path-pinning), so
      // attaching it unconditionally would leak the token onto whatever other
      // same-site page a crafted `next` value points to.
      if (isResetPasswordPath(target)) {
        // Reusing the service-role key as HMAC secret is deliberate: it's already a
        // server-only secret nothing client-side can read, HMAC is one-way (doesn't
        // expose the key), and these tokens are short-lived enough that a future key
        // rotation naturally invalidates them rather than breaking anything.
        destination.searchParams.set(
          'proof',
          createRecoveryProof(process.env.SUPABASE_SERVICE_ROLE_KEY!)
        )
      }
      return NextResponse.redirect(destination)
    }
  }

  // Missing code, or exchange failed (e.g. otp_expired) — send the user
  // back to login with a flag so it can show "link expired, resend".
  return NextResponse.redirect(new URL(`/${defaultLocale}/login?resetError=1`, url.origin))
}
