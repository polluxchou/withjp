import { NextRequest, NextResponse } from 'next/server'
import { createMemberDeleteHandler, createMemberPatchHandler } from '@/lib/site/members-service.ts'
import { memberRouteDeps } from '../../_shared/deps.ts'

type Params = { params: Promise<{ no: string }> }

// PATCH/DELETE 都走 canEditSiteContent（members-service.ts 内部判定），
// 不通过返回 403。依赖绑定见 ../../_shared/deps.ts（评审 Important：4 个
// route.ts 里这段逐字节相同）。
export async function PATCH(req: NextRequest, props: Params) {
  const params = await props.params
  const result = await createMemberPatchHandler(memberRouteDeps({ strict: true }))(req, params.no)
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(_req: NextRequest, props: Params) {
  const params = await props.params
  const result = await createMemberDeleteHandler(memberRouteDeps({ strict: true }))(params.no)
  return NextResponse.json(result.body, { status: result.status })
}
