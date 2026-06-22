import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getVenueLayout, saveVenueLayout, httpStatusForError } from '@/lib/venue/service'
import type { VenueLayout } from '@/venue/layoutData'

// GET /api/venue — 返回全团队共享布局
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await getVenueLayout()
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

// PUT /api/venue — 整份保存布局
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
