import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import { createServerClient } from '@/lib/supabase/server'
import {
  createMemberListHandler,
  type AuthResult,
  type MemberDb,
  type MemberRouteDeps,
} from '@/lib/site/members-service.ts'

/**
 * 读写分开（同 news/route.ts，规格 §5.3）：GET 只需登录（authGuard），12 个
 * 卡位由 seed 建好，这里没有 POST——增删不属于本任务范围，业务判定全部在
 * members-service.ts 里，这个文件只做「绑定真实依赖 + 转成 NextResponse」。
 */
async function boundAuthGuard(): Promise<AuthResult> {
  const user = await authGuard()
  if (user instanceof NextResponse) return { ok: false, status: 401 }
  return { ok: true, user: { id: user.id } }
}

// members-service.ts 的 MemberDb 是为可测试性收窄过的最小接口（理由同
// news-service.ts 的 NewsDb），这里的转换只收窄类型、不改变运行时行为——db
// 在生产环境仍是真实 supabase 客户端。
function deps(): MemberRouteDeps {
  return {
    authGuard: boundAuthGuard,
    getActorProfile,
    db: createServerClient() as unknown as MemberDb,
    revalidatePath,
  }
}

export async function GET() {
  const result = await createMemberListHandler(deps())()
  return NextResponse.json(result.body, { status: result.status })
}
