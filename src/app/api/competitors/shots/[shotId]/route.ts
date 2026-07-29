// src/app/api/competitors/shots/[shotId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateShot, deleteShot, httpStatusForError } from '@/lib/competitors/service'

// PATCH /api/competitors/shots/[shotId] — body { shot_on?, tag?, caption?, sort_order? }
export async function PATCH(req: NextRequest, { params }: { params: { shotId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
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
export async function DELETE(_req: NextRequest, { params }: { params: { shotId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await deleteShot(params.shotId)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
