import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  createMessage,
  listMessages,
  httpStatusForDiscussionError,
  type CreateMessageInput,
} from '@/lib/discussions/service'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  const result = await listMessages(actor, params.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForDiscussionError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  let body: Partial<CreateMessageInput>
  try {
    body = await req.json() as Partial<CreateMessageInput>
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.body) {
    return NextResponse.json({ data: null, error: 'body is required' }, { status: 400 })
  }

  const result = await createMessage(actor, params.id, {
    body:     body.body,
    parentId: body.parentId,
  })
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForDiscussionError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
