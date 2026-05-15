import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  getThread,
  httpStatusForDiscussionError,
} from '@/lib/discussions/service'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  const result = await getThread(actor, params.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForDiscussionError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
