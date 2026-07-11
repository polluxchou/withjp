import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { removePositionMember, httpStatusForError } from '@/lib/org/service'

// DELETE /api/org/positions/[id]/members/[memberId]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; memberId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await removePositionMember(user.id, params.memberId)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
