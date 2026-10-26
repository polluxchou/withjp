// src/app/api/competitors/shots/[shotId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'
import { updateShot, deleteShot, checkScopedWrite, httpStatusForError } from '@/lib/competitors/service'

// PATCH /api/competitors/shots/[shotId] — body { shot_on?, tag?, caption?, sort_order? }
export async function PATCH(req: NextRequest, props: { params: Promise<{ shotId: string }> }) {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  if (user instanceof NextResponse) return user
  const params = await props.params
  const denied = await checkScopedWrite(user, 'competitor_shots', params.shotId, 'update')
  if (denied.error) {
    return NextResponse.json({ data: null, error: denied.error.message }, { status: httpStatusForError(denied.error.code) })
  }
  let body: { shot_on?: string | null; tag?: string | null; caption?: string; sort_order?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await updateShot(params.shotId, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/competitors/shots/[shotId]
export async function DELETE(_req: NextRequest, props: { params: Promise<{ shotId: string }> }) {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  if (user instanceof NextResponse) return user
  const params = await props.params
  const denied = await checkScopedWrite(user, 'competitor_shots', params.shotId, 'delete')
  if (denied.error) {
    return NextResponse.json({ data: null, error: denied.error.message }, { status: httpStatusForError(denied.error.code) })
  }
  const result = await deleteShot(params.shotId)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
