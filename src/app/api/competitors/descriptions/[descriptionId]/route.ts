// src/app/api/competitors/descriptions/[descriptionId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'
import { updateDescription, deleteDescription, checkScopedWrite, httpStatusForError } from '@/lib/competitors/service'

// PATCH /api/competitors/descriptions/[descriptionId] — body { body?, generated_on? }
export async function PATCH(req: NextRequest, props: { params: Promise<{ descriptionId: string }> }) {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  if (user instanceof NextResponse) return user
  const params = await props.params
  const denied = await checkScopedWrite(user, 'competitor_descriptions', params.descriptionId, 'update')
  if (denied.error) {
    return NextResponse.json({ data: null, error: denied.error.message }, { status: httpStatusForError(denied.error.code) })
  }
  let body: { body?: string; generated_on?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await updateDescription(params.descriptionId, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/competitors/descriptions/[descriptionId]
export async function DELETE(_req: NextRequest, props: { params: Promise<{ descriptionId: string }> }) {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  if (user instanceof NextResponse) return user
  const params = await props.params
  const denied = await checkScopedWrite(user, 'competitor_descriptions', params.descriptionId, 'delete')
  if (denied.error) {
    return NextResponse.json({ data: null, error: denied.error.message }, { status: httpStatusForError(denied.error.code) })
  }
  const result = await deleteDescription(params.descriptionId)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
