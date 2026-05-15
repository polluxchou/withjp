import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import {
  createThread,
  listThreads,
  httpStatusForDiscussionError,
  type CreateThreadInput,
} from '@/lib/discussions/service'
import type { ServiceKey, SubjectInput } from '@/lib/discussions/types'

export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  let body: Partial<CreateThreadInput>
  try {
    body = await req.json() as Partial<CreateThreadInput>
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.subject || !body.title || !body.firstMessage) {
    return NextResponse.json(
      { data: null, error: 'subject, title and firstMessage are required' },
      { status: 400 },
    )
  }

  const result = await createThread(actor, {
    subject:      body.subject as SubjectInput,
    title:        body.title,
    firstMessage: body.firstMessage,
  })
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForDiscussionError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const actor = await getActorProfile(user.id)
  if (!actor) return NextResponse.json({ data: null, error: 'Unknown user' }, { status: 403 })

  const params = req.nextUrl.searchParams
  const serviceKey = params.get('serviceKey') as ServiceKey | null
  const entityType = params.get('entityType')
  if (!serviceKey || !entityType) {
    return NextResponse.json(
      { data: null, error: 'serviceKey and entityType are required' },
      { status: 400 },
    )
  }

  const entityId = params.get('entityId') ?? undefined
  const filtersRaw = params.get('filters')
  const label = params.get('label') ?? undefined
  const route = params.get('route') ?? undefined
  const statusRaw = params.get('status')
  const status = statusRaw === 'open' || statusRaw === 'resolved' ? statusRaw : undefined

  let filters: Record<string, unknown> | undefined
  if (filtersRaw) {
    try {
      filters = JSON.parse(filtersRaw) as Record<string, unknown>
    } catch {
      return NextResponse.json({ data: null, error: 'filters must be valid JSON' }, { status: 400 })
    }
  }

  if (entityId === undefined && filters === undefined) {
    return NextResponse.json(
      { data: null, error: 'either entityId or filters must be provided' },
      { status: 400 },
    )
  }

  const result = await listThreads(actor, {
    serviceKey,
    entityType,
    entityId,
    filters,
    label,
    route,
    status,
  })
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message, code: result.error.code },
      { status: httpStatusForDiscussionError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
