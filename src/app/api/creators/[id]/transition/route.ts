import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { transitionCreator } from '@/lib/state-machine/transition'
import { authGuard } from '@/lib/auth/guard'
import type { CreatorStatus } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

// POST /api/creators/:id/transition
// Body: { to_status, triggered_by?, notes? }
export async function POST(req: NextRequest, props: Params) {
  const user = await authGuard();
  if (user instanceof NextResponse) return user;
  const params = await props.params
  const db = createServerClient()
  const body = await req.json()
  const { to_status, triggered_by = 'user', notes } = body as {
    to_status: CreatorStatus
    triggered_by?: string
    notes?: string
  }

  if (!to_status) {
    return NextResponse.json({ data: null, error: 'to_status is required' }, { status: 400 })
  }

  const result = await transitionCreator(db, {
    creatorId:   params.id,
    toStatus:    to_status,
    triggeredBy: triggered_by,
    notes,
  })
  if (!result.ok) return NextResponse.json({ data: null, error: result.error }, { status: result.status })

  return NextResponse.json({ data: result.creator, error: null })
}
