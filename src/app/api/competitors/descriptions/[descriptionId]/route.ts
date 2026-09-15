// src/app/api/competitors/descriptions/[descriptionId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateDescription, deleteDescription, httpStatusForError } from '@/lib/competitors/service'

// PATCH /api/competitors/descriptions/[descriptionId] — body { body?, generated_on? }
export async function PATCH(req: NextRequest, { params }: { params: { descriptionId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
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
export async function DELETE(_req: NextRequest, { params }: { params: { descriptionId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await deleteDescription(params.descriptionId)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
