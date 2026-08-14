import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import { createServerClient } from '@/lib/supabase/server'
import {
  createMemberPatchHandler,
  type AuthResult,
  type MemberDb,
  type MemberRouteDeps,
} from '@/lib/site/members-service.ts'

type Params = { params: { no: string } }

async function boundAuthGuard(): Promise<AuthResult> {
  const user = await authGuard()
  if (user instanceof NextResponse) return { ok: false, status: 401 }
  return { ok: true, user: { id: user.id } }
}

function deps(): MemberRouteDeps {
  return {
    authGuard: boundAuthGuard,
    getActorProfile,
    db: createServerClient() as unknown as MemberDb,
    revalidatePath,
  }
}

// PATCH 走 canEditSiteContent（members-service.ts 内部判定），不通过返回 403。
export async function PATCH(req: NextRequest, { params }: Params) {
  const result = await createMemberPatchHandler(deps())(req, params.no)
  return NextResponse.json(result.body, { status: result.status })
}
