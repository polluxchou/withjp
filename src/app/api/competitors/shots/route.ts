import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { COMPETITORS_SCOPE } from '@/lib/auth/access-scope'
import { getShotsInRange, httpStatusForError } from '@/lib/competitors/service'
import { parseShotRangeQuery } from '@/lib/competitors/shotWindow'

// GET /api/competitors/shots?from=YYYY-MM-DD&before=YYYY-MM-DD — 往历史翻页时补取 [from, before) 的截图
export async function GET(req: NextRequest) {
  const user = await authGuard({ allowScope: COMPETITORS_SCOPE })
  if (user instanceof NextResponse) return user
  const params = req.nextUrl.searchParams
  const q = parseShotRangeQuery(params.get('from'), params.get('before'))
  if (!q.ok) {
    return NextResponse.json({ data: null, error: 'from/before must be YYYY-MM-DD with from < before' }, { status: 400 })
  }
  const result = await getShotsInRange(q.from, q.before)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
