import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getCompetitorBoard, addCompetitor, httpStatusForError } from '@/lib/competitors/service'

// GET /api/competitors — 返回看板（含 canEdit）
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const result = await getCompetitorBoard(user.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// POST /api/competitors — body { url? | handle?, note?, platform? }
export async function POST(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { url?: string; handle?: string; note?: string; platform?: 'tiktok' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await addCompetitor(user.id, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
