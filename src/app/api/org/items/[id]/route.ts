import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { updateItem, deleteItem, httpStatusForError } from '@/lib/org/service'
import type { MemberType } from '@/lib/types'

// PATCH /api/org/items/[id] — body { name?, owner?: {member_type,user_id,creator_id} | null }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { name?: string; owner?: { member_type: MemberType; user_id: string | null; creator_id: string | null } | null }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  const result = await updateItem(user.id, params.id, { name: body.name, owner: body.owner })
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}

// DELETE /api/org/items/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await deleteItem(user.id, params.id)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
