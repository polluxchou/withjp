import { NextRequest, NextResponse } from 'next/server'
import { verifyRecoveryProof } from '@/lib/auth/recovery-proof'

// GET /api/auth/verify-recovery-proof?proof=... — stateless check for the
// short-lived recovery-proof token /auth/callback mints. See
// src/lib/auth/recovery-proof.ts for what this proves and why it's needed.
export async function GET(request: NextRequest) {
  const proof = request.nextUrl.searchParams.get('proof')
  const valid = verifyRecoveryProof(process.env.SUPABASE_SERVICE_ROLE_KEY!, proof)
  return NextResponse.json({ valid })
}
