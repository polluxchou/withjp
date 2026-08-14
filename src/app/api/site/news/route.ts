import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import { createServerClient } from '@/lib/supabase/server'
import {
  createNewsCreateHandler,
  createNewsListHandler,
  type AuthResult,
  type NewsDb,
  type NewsRouteDeps,
} from '@/lib/site/news-service.ts'

/**
 * 读写分开（规格 §5.3）：GET 只需登录（authGuard），侧边栏入口对所有登录
 * 用户可见、列表可读；POST 才走 canEditSiteContent，业务判定全部在
 * news-service.ts 里，这个文件只做「绑定真实依赖 + 转成 NextResponse」。
 */
async function boundAuthGuard(): Promise<AuthResult> {
  const user = await authGuard()
  if (user instanceof NextResponse) return { ok: false, status: 401 }
  return { ok: true, user: { id: user.id } }
}

// news-service.ts 的 NewsDb 是为可测试性收窄过的最小接口（分阶段的真实
// supabase 查询构造器类型在这里会因泛型形状对不上而编译失败），这里的转换
// 只收窄类型、不改变运行时行为——db 在生产环境仍是真实 supabase 客户端。
function deps(): NewsRouteDeps {
  return {
    authGuard: boundAuthGuard,
    getActorProfile,
    db: createServerClient() as unknown as NewsDb,
    revalidatePath,
  }
}

export async function GET() {
  const result = await createNewsListHandler(deps())()
  return NextResponse.json(result.body, { status: result.status })
}

export async function POST(req: NextRequest) {
  const result = await createNewsCreateHandler(deps())(req)
  return NextResponse.json(result.body, { status: result.status })
}
