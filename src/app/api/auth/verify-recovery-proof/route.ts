import { NextRequest, NextResponse } from 'next/server'
import { verifyRecoveryProof } from '@/lib/auth/recovery-proof'

// GET /api/auth/verify-recovery-proof?proof=... — stateless check for the
// short-lived recovery-proof token /auth/callback mints. See
// src/lib/auth/recovery-proof.ts for what this proves and why it's needed.
export async function GET(request: NextRequest) {
  const proof = request.nextUrl.searchParams.get('proof')
  // Reusing the service-role key as HMAC secret is deliberate: it's already a
  // server-only secret nothing client-side can read, HMAC is one-way (doesn't
  // expose the key), and these tokens are short-lived enough that a future key
  // rotation naturally invalidates them rather than breaking anything.
  const valid = verifyRecoveryProof(process.env.SUPABASE_SERVICE_ROLE_KEY!, proof)
  return NextResponse.json({ valid })
}
