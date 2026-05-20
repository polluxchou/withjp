import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import {
  httpStatusForNotificationError,
  markNotificationRead,
} from '@/lib/notifications/service'

type Params = { params: { id: string } }

// PATCH /api/notifications/:id/read
export async function PATCH(_req: NextRequest, { params }: Params) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await markNotificationRead(params.id, user.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForNotificationError(result.error.code) },
    )
  }

  return NextResponse.json({ data: result.data, error: null })
}
