import { NextRequest, NextResponse } from 'next/server'
import { createMemberCreateHandler, createMemberListHandler } from '@/lib/site/members-service.ts'
import { memberRouteDeps } from '../_shared/deps.ts'

/**
 * 读写分开（同 news/route.ts，规格 §5.3）：GET 只需登录（authGuard），POST 才走
 * canEditSiteContent（members-service.ts 内部判定）——卡位数据驱动之后，新增
 * 卡位就是这里的职责，这个文件只做「绑定真实依赖 + 转成 NextResponse」。
 * 依赖绑定本身收在 ../_shared/deps.ts（评审 Important：4 个 route.ts 里这段
 * 逐字节相同）。
 */
export async function GET() {
  const result = await createMemberListHandler(memberRouteDeps())()
  return NextResponse.json(result.body, { status: result.status })
}

export async function POST(req: NextRequest) {
  const result = await createMemberCreateHandler(memberRouteDeps())(req)
  return NextResponse.json(result.body, { status: result.status })
}
