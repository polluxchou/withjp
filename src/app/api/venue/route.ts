import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getVenueLayout, saveVenueLayout, listVenues, createVenue, httpStatusForError } from '@/lib/venue/service'
import type { VenueLayout } from '@/venue/layoutData'

// GET /api/venue            → 场地列表（用于切换器）
// GET /api/venue?id=<venueId> → 指定场地的完整布局
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const id = req.nextUrl.searchParams.get('id')
  const result = id ? await getVenueLayout(id) : await listVenues()
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

// POST /api/venue — 新建场地（body: { name }），返回新场地布局
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { name?: string }
  try {
    body = (await req.json()) as { name?: string }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await createVenue(body.name ?? '')
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

// PUT /api/venue — 整份保存布局（按 body.venueId 作用域）
export async function PUT(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: VenueLayout
  try {
    body = (await req.json()) as VenueLayout
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await saveVenueLayout(body)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
