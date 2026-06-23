import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import { getVenueEditors, setVenueEditors, httpStatusForError } from '@/lib/venue/service'

// GET /api/venue/collaborators?id=<venueId>
//   → { userIds: string[]; canManage: boolean } — current editors + whether the
//     caller may manage them (owner / admin).
export async function GET(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const venueId = req.nextUrl.searchParams.get('id')
  if (!venueId) {
    return NextResponse.json({ data: null, error: 'venue id required' }, { status: 400 })
  }
  const result = await getVenueEditors(venueId, user.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}

// PUT /api/venue/collaborators — body { venueId, userIds } — replace the editor
// set. Owner / admin only (enforced in the service).
export async function PUT(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { venueId?: string; userIds?: string[] }
  try {
    body = (await req.json()) as { venueId?: string; userIds?: string[] }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.venueId || !Array.isArray(body.userIds)) {
    return NextResponse.json({ data: null, error: 'venueId and userIds required' }, { status: 400 })
  }

  const result = await setVenueEditors(body.venueId, body.userIds, user.id)
  if (result.error) {
    return NextResponse.json({ data: null, error: result.error.message }, { status: httpStatusForError(result.error.code) })
  }
  return NextResponse.json({ data: result.data, error: null })
}
