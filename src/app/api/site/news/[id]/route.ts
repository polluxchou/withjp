import { NextRequest, NextResponse } from 'next/server'
import { createNewsDeleteHandler, createNewsPatchHandler } from '@/lib/site/news-service.ts'
import { newsRouteDeps } from '../../_shared/deps.ts'

type Params = { params: { id: string } }

// PATCH/DELETE 都走 canEditSiteContent（news-service.ts 内部判定），
// 不通过返回 403。依赖绑定见 ../../_shared/deps.ts（评审 Important：4 个
// route.ts 里这段逐字节相同）。
export async function PATCH(req: NextRequest, { params }: Params) {
  const result = await createNewsPatchHandler(newsRouteDeps())(req, params.id)
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const result = await createNewsDeleteHandler(newsRouteDeps())(params.id)
  return NextResponse.json(result.body, { status: result.status })
}
