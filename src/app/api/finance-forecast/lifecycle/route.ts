import { NextRequest, NextResponse } from 'next/server'
import { authGuard } from '@/lib/auth/guard'
import {
  httpStatusForLifecycleError,
  loadLifecycleTemplates,
  saveLifecycleTemplates,
  type LifecycleTemplateSet,
} from '@/lib/finance-forecast/lifecycle'

export async function GET() {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  const result = await loadLifecycleTemplates(user.id)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForLifecycleError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}

export async function PUT(req: NextRequest) {
  const user = await authGuard()
  if (user instanceof NextResponse) return user

  let body: { templates?: LifecycleTemplateSet }
  try {
    body = await req.json() as { templates?: LifecycleTemplateSet }
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.templates) {
    return NextResponse.json({ data: null, error: 'templates payload required' }, { status: 400 })
  }

  const result = await saveLifecycleTemplates(user.id, body.templates)
  if (result.error) {
    return NextResponse.json(
      { data: null, error: result.error.message },
      { status: httpStatusForLifecycleError(result.error.code) },
    )
  }
  return NextResponse.json({ data: result.data, error: null })
}
