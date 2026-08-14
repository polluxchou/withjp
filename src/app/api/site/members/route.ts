import { NextResponse } from 'next/server'
import { createMemberListHandler } from '@/lib/site/members-service.ts'
import { memberRouteDeps } from '../_shared/deps.ts'

/**
 * 读写分开（同 news/route.ts，规格 §5.3）：GET 只需登录（authGuard），12 个
 * 卡位由 seed 建好，这里没有 POST——增删不属于本任务范围，业务判定全部在
 * members-service.ts 里，这个文件只做「绑定真实依赖 + 转成 NextResponse」。
 * 依赖绑定本身收在 ../_shared/deps.ts（评审 Important：4 个 route.ts 里这段
 * 逐字节相同）。
 */
export async function GET() {
  const result = await createMemberListHandler(memberRouteDeps())()
  return NextResponse.json(result.body, { status: result.status })
}
