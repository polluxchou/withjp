import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { translateVenueItemNames, httpStatusForError } from '@/lib/venue/service'

// POST /api/venue/translate  body: { venueId?: string }
// 翻译该场地下陈旧的组件名称,返回 { [itemId]: { ja, en } } 映射。
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { venueId?: string }
  try {
    body = (await req.json()) as { venueId?: string }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await translateVenueItemNames(body.venueId)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
