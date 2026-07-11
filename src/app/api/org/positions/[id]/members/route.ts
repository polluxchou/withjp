import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { addPositionMember, httpStatusForError } from '@/lib/org/service'
import type { MemberType } from '@/lib/types'

// POST /api/org/positions/[id]/members — body { member_type, user_id?, creator_id? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { member_type?: MemberType; user_id?: string | null; creator_id?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  if (body.member_type !== 'user' && body.member_type !== 'creator') {
    return NextResponse.json({ data: null, error: 'member_type required' }, { status: 400 })
  }
  const result = await addPositionMember(user.id, params.id, {
    member_type: body.member_type, user_id: body.user_id ?? null, creator_id: body.creator_id ?? null,
  })
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
