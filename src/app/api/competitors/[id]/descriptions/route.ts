// src/app/api/competitors/[id]/descriptions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { addDescription, httpStatusForError } from '@/lib/competitors/service'
import type { DescriptionInput } from '@/lib/competitors/service'

// POST /api/competitors/[id]/descriptions — body { body, generated_on }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user
  let body: DescriptionInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = await addDescription(params.id, body)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null }, { status: 201 })
}
