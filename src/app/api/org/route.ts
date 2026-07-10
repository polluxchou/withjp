import { NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getOrgSnapshot, httpStatusForError } from '@/lib/org/service'

export const dynamic = 'force-dynamic'

// GET /api/org → OrgSnapshot（业务树 + 岗位&成员 + 候选人 + canEdit）
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await getOrgSnapshot(user.id)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
