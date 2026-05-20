import { NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import {
  httpStatusForNotificationError,
  listNotificationsForUser,
} from '@/lib/notifications/service'

// GET /api/notifications
export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await listNotificationsForUser(user.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, unread_count: 0, error: result.error.message },
      { status: httpStatusForNotificationError(result.error.code) },
    )
  }

  return NextResponse.json({
    data: result.data.notifications,
    unread_count: result.data.unread_count,
    error: null,
  })
}
