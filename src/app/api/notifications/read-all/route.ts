import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import {
  httpStatusForNotificationError,
  markAllNotificationsRead,
} from '@/lib/notifications/service'

// PATCH /api/notifications/read-all
export async function PATCH(_req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await markAllNotificationsRead(user.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForNotificationError(result.error.code) },
    )
  }

  return NextResponse.json({ data: result.data, error: null })
}
