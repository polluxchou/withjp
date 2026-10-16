import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateCompetitor, deleteCompetitor, httpStatusForError } from '@/lib/competitors/service'
import type { CompetitorFields } from '@/lib/competitors/service'

// PATCH /api/competitors/[id] — body: 团级字段
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const params = await props.params
  let body: CompetitorFields
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await updateCompetitor(user.id, params.id, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/competitors/[id]
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const params = await props.params
  const result = await deleteCompetitor(user.id, params.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
