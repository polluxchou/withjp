import { NextRequest, NextResponse } from 'next/server'
import { createNewsCreateHandler, createNewsListHandler } from '@/lib/site/news-service.ts'
import { newsRouteDeps } from '../_shared/deps.ts'

/**
 * 读写分开（规格 §5.3）：GET 只需登录（authGuard），侧边栏入口对所有登录
 * 用户可见、列表可读；POST 才走 canEditSiteContent，业务判定全部在
 * news-service.ts 里，这个文件只做「绑定真实依赖 + 转成 NextResponse」。
 * 依赖绑定本身（boundAuthGuard/deps）收在 ../_shared/deps.ts，与
 * news/[id]/route.ts、members/route.ts、members/[no]/route.ts 共用同一份
 * 实现（评审 Important：4 个 route.ts 里这段逐字节相同）。
 */
export async function GET() {
  const result = await createNewsListHandler(newsRouteDeps())()
  return NextResponse.json(result.body, { status: result.status })
}

export async function POST(req: NextRequest) {
  const result = await createNewsCreateHandler(newsRouteDeps())(req)
  return NextResponse.json(result.body, { status: result.status })
}
