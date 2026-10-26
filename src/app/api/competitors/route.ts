import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'
import { getCompetitorBoard, addCompetitor, httpStatusForError } from '@/lib/competitors/service'
import type { CompetitorFields } from '@/lib/competitors/service'
import { parseSinceQuery } from '@/lib/competitors/shotWindow'

// GET /api/competitors?since=YYYY-MM-DD — 看板（含 canEdit）。截图默认只带最近一段；
// since 把已加载起点往前推（改完数据刷新时保住用户已翻到的范围）。
export async function GET(req: NextRequest) {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  if (user instanceof NextResponse) return user
  const q = parseSinceQuery(req.nextUrl.searchParams.get('since'))
  if (!q.ok) return NextResponse.json({ data: null, error: 'since must be YYYY-MM-DD' }, { status: 400 })
  const result = await getCompetitorBoard(user.id, { since: q.since })
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// POST /api/competitors — body { url? | handle?, platform?, ...团级字段 }
export async function POST(req: NextRequest) {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  if (user instanceof NextResponse) return user
  let body: { url?: string; handle?: string; platform?: 'tiktok' } & CompetitorFields
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
