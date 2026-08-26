import { createHmac, timingSafeEqual } from 'node:crypto'

// Proof that a visit to /reset-password immediately followed a successful
// /auth/callback code exchange, not just an ordinary already-logged-in
// session. Supabase's own recovery-session signals (PASSWORD_RECOVERY event,
// JWT amr claim) don't fire in this project's server-side PKCE exchange
// architecture, so this is a first-party stand-in: a short-lived HMAC-signed
// token minted server-side right after the exchange succeeds.
const PROOF_TTL_MS = 2 * 60 * 1000

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function createRecoveryProof(secret: string, now: number = Date.now()): string {
  const expiresAt = now + PROOF_TTL_MS
  return `${expiresAt}.${sign(secret, String(expiresAt))}`
}

export function verifyRecoveryProof(
  secret: string,
  token: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!token) return false
  const [expiresAtStr, signature] = token.split('.')
  if (!expiresAtStr || !signature) return false

  const expiresAt = Number(expiresAtStr)
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false

  const expected = sign(secret, expiresAtStr)
  const actual = Buffer.from(signature)
  const expectedBuf = Buffer.from(expected)
  if (actual.length !== expectedBuf.length) return false
  return timingSafeEqual(actual, expectedBuf)
}
