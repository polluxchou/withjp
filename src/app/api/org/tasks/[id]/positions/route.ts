import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { setTaskPositions, httpStatusForError } from '@/lib/org/service'

// PUT /api/org/tasks/[id]/positions — body { positionIds: string[] } 整体覆盖
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: { positionIds?: string[] }
  try { body = await req.json() } catch { return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 }) }
  if (!Array.isArray(body.positionIds)) return NextResponse.json({ data: null, error: 'positionIds required' }, { status: 400 })
  const result = await setTaskPositions(user.id, params.id, body.positionIds)
  if (result.error) return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  return NextResponse.json({ data: result.data, error: null })
}
