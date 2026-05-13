import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  createView,
  listVisibleViews,
  httpStatusForViewError,
} from '@/lib/finance-forecast/views'

export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  const result = await listVisibleViews(actor)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForViewError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  let body: { name?: string; note?: string }
  try {
    body = await req.json() as { name?: string; note?: string }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await createView(actor, { name: body.name ?? '', note: body.note })
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForViewError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
