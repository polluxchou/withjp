import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { applyPendingAction, cancelPendingAction } from '@/lib/intent/executor'

type Params = { params: { id: string } }

// POST /api/intent/pending-actions/:id — confirm + apply
export async function POST(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await applyPendingAction(params.id, user.id)
  if (result.kind === 'applied') {
    return NextResponse.json({ data: { id: params.id, appliedId: result.appliedId }, error: null })
  }
  if (result.kind === 'noop') {
    return NextResponse.json(
      { data: null, error: `Cannot apply: ${result.reason}` },
      { status: result.reason === 'not_owner' ? 403 : 409 },
    )
  }
  return NextResponse.json({ data: null, error: result.message }, { status: 500 })
}

// DELETE /api/intent/pending-actions/:id — cancel
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await cancelPendingAction(params.id, user.id)
  if (result.kind === 'applied') {
    return NextResponse.json({ data: { id: params.id }, error: null })
  }
  if (result.kind === 'noop') {
    return NextResponse.json(
      { data: null, error: `Cannot cancel: ${result.reason}` },
      { status: result.reason === 'not_owner' ? 403 : 409 },
    )
  }
  return NextResponse.json({ data: null, error: result.message }, { status: 500 })
}
