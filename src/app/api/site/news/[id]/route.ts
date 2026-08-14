import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import { createServerClient } from '@/lib/supabase/server'
import {
  createNewsDeleteHandler,
  createNewsPatchHandler,
  type AuthResult,
  type NewsDb,
  type NewsRouteDeps,
} from '@/lib/site/news-service.ts'

type Params = { params: { id: string } }

async function boundAuthGuard(): Promise<AuthResult> {
  const user = await authGuard()
  if (user instanceof NextResponse) return { ok: false, status: 401 }
  return { ok: true, user: { id: user.id } }
}

function deps(): NewsRouteDeps {
  return {
    authGuard: boundAuthGuard,
    getActorProfile,
    db: createServerClient() as unknown as NewsDb,
    revalidatePath,
  }
}

// PATCH/DELETE 都走 canEditSiteContent（news-service.ts 内部判定），
// 不通过返回 403。
export async function PATCH(req: NextRequest, { params }: Params) {
  const result = await createNewsPatchHandler(deps())(req, params.id)
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const result = await createNewsDeleteHandler(deps())(params.id)
  return NextResponse.json(result.body, { status: result.status })
}
