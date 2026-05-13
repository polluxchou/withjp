import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  deleteView,
  updateView,
  httpStatusForViewError,
} from '@/lib/finance-forecast/views'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  let body: { name?: string; note?: string; is_public?: boolean }
  try {
    body = await req.json() as { name?: string; note?: string; is_public?: boolean }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await updateView(actor, params.id, {
    name:      body.name,
    note:      body.note,
    is_public: body.is_public,
  })
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForViewError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  const result = await deleteView(actor, params.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForViewError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
