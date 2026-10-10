// src/app/api/competitors/[id]/live-sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { httpStatusForError, upsertLiveSessions } from '@/lib/competitors/service'

// POST /api/competitors/[id]/live-sessions — body { sessions: [{ started_at, ended_at, title, likes }] }
// 粘贴导入开播记录：按 (competitor_id, started_at) upsert，逐行校验在 service 里做。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { sessions?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await upsertLiveSessions(params.id, body?.sessions)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
