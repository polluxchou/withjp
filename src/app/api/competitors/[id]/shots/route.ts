// src/app/api/competitors/[id]/shots/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { addShot, httpStatusForError } from '@/lib/competitors/service'
import type { ShotInput } from '@/lib/competitors/service'

// POST /api/competitors/[id]/shots — body { image_url, shot_on?, tag?, caption?, sort_order? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: ShotInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await addShot(params.id, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null }, { status: 201 })
}
