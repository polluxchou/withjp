// src/app/api/competitors/shots/[shotId]/readings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { parseShotId } from '@/lib/competitors/coLive'
import { getShotReadings, httpStatusForError } from '@/lib/competitors/service'

// GET /api/competitors/shots/[shotId]/readings — 放大页按需取这张截图的同期人数读数
export async function GET(_req: NextRequest, { params }: { params: { shotId: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  const shotId = parseShotId(params.shotId)
  if (!shotId) return NextResponse.json({ data: null, error: 'shotId must be a uuid' }, { status: 400 })
  const result = await getShotReadings(shotId)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
