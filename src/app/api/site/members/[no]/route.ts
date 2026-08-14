import { NextRequest, NextResponse } from 'next/server'
import { createMemberPatchHandler } from '@/lib/site/members-service.ts'
import { memberRouteDeps } from '../../_shared/deps.ts'

type Params = { params: { no: string } }

// PATCH 走 canEditSiteContent（members-service.ts 内部判定），不通过返回 403。
// 依赖绑定见 ../../_shared/deps.ts（评审 Important：4 个 route.ts 里这段
// 逐字节相同）。
export async function PATCH(req: NextRequest, { params }: Params) {
  const result = await createMemberPatchHandler(memberRouteDeps())(req, params.no)
  return NextResponse.json(result.body, { status: result.status })
}
