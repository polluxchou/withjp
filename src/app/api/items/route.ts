import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { listItems, createItem, httpStatusForError, type CreateItemInput } from '@/lib/items/service'

export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const params = req.nextUrl.searchParams
  const result = await listItems({
    q:                  params.get('q'),
    kind:               params.get('kind'),
    status:             params.get('status'),
    venue_item_id:      params.get('venue_item_id'),
    responsible_person: params.get('responsible_person'),
  })
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: CreateItemInput
  try {
    body = (await req.json()) as CreateItemInput
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await createItem(body, user.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null }, { status: 201 })
}
