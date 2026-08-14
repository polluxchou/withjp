import { NextRequest, NextResponse } from 'next/server'
import { getActorProfile } from '@/lib/auth/actor'
import { validateImage, uploadImage } from '@/lib/storage/upload-image.ts'
import { createUploadHandler, type UploadRouteDeps } from '@/lib/site/upload-service.ts'
import { boundSiteContentAuthGuard } from '../_shared/deps.ts'

// 业务判定全部在 upload-service.ts 里（评审 Important：补测试矩阵），这个
// 文件只做「绑定真实依赖 + 转成 NextResponse」，鉴权前导复用
// ../_shared/deps.ts 的 boundSiteContentAuthGuard（同 news/members 的
// route.ts）。
function deps(): UploadRouteDeps {
  return {
    authGuard: boundSiteContentAuthGuard,
    getActorProfile,
    validateImage,
    uploadImage,
  }
}

export async function POST(req: NextRequest) {
  const result = await createUploadHandler(deps())(req)
  return NextResponse.json(result.body, { status: result.status })
}
