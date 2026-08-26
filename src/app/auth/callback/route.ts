import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'
import { resolveCallbackRedirect } from '@/lib/auth/reset-redirect'
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
      const destination = new URL(resolveCallbackRedirect(next), url.origin)
      // Proves to /reset-password that this visit came from a fresh,
      // successful code exchange — not just any already-logged-in session
      // (see src/lib/auth/recovery-proof.ts for why this exists).
      destination.searchParams.set(
        'proof',
        createRecoveryProof(process.env.SUPABASE_SERVICE_ROLE_KEY!)
      )
      return NextResponse.redirect(destination)
    }
  }

  // Missing code, or exchange failed (e.g. otp_expired) — send the user
  // back to login with a flag so it can show "link expired, resend".
  return NextResponse.redirect(new URL(`/${defaultLocale}/login?resetError=1`, url.origin))
}
