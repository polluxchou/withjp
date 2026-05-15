import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  resolveCounts,
  httpStatusForDiscussionError,
  type CountSubject,
} from '@/lib/discussions/service'

export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  let body: { subjects?: CountSubject[] }
  try {
    body = await req.json() as { subjects?: CountSubject[] }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.subjects)) {
    return NextResponse.json(
      { data: null, error: 'subjects must be an array' },
      { status: 400 },
    )
  }

  const result = await resolveCounts(actor, body.subjects)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForDiscussionError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
