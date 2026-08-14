import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { authGuard } from '@/lib/auth/guard'
import { getActorProfile } from '@/lib/auth/actor'
import { createServerClient } from '@/lib/supabase/server'
import type { AuthResult } from '@/lib/site/site-content-shared.ts'
import type { NewsDb, NewsRouteDeps } from '@/lib/site/news-service.ts'
import type { MemberDb, MemberRouteDeps } from '@/lib/site/members-service.ts'

/**
 * 4 个 route.ts（news/、news/[id]/、members/、members/[no]/）逐字节相同的
 * 「绑定真实依赖」样板（评审 Important：抽共享模块）：boundSiteContentAuthGuard
 * 把 authGuard() 的 NextResponse 结果转成 news-service.ts/members-service.ts
 * 认得的平铺 AuthResult；newsRouteDeps()/memberRouteDeps() 把真实
 * supabase/revalidatePath 绑进各自的 RouteDeps。
 *
 * 这个目录以下划线开头（Next.js app router 的私有目录约定），不会被当成路由
 * 加载，只是普通模块——可以放心 import 'next/server'/'next/cache'，因为它和
 * route.ts 一样只被 Next 自己的打包器加载，从不被 node --test 直接 import。
 */
// 导出（不只是给 news/members 用）：/api/site/upload/route.ts 的鉴权前导
// 逐字节相同,同样复用这一份,不再多一份拷贝（评审 Important：补 upload 测试
// 矩阵那一轮顺带发现的第 5 处重复）。
export async function boundSiteContentAuthGuard(): Promise<AuthResult> {
  const user = await authGuard()
  if (user instanceof NextResponse) return { ok: false, status: 401 }
  return { ok: true, user: { id: user.id } }
}

// news-service.ts/members-service.ts 的 NewsDb/MemberDb 是为可测试性收窄过的
// 最小接口（分阶段的真实 supabase 查询构造器类型在这里会因泛型形状对不上而
// 编译失败），这里的转换只收窄类型、不改变运行时行为——db 在生产环境仍是
// 真实 supabase 客户端。
export function newsRouteDeps(): NewsRouteDeps {
  return {
    authGuard: boundSiteContentAuthGuard,
    getActorProfile,
    db: createServerClient() as unknown as NewsDb,
    revalidatePath,
  }
}

export function memberRouteDeps(): MemberRouteDeps {
  return {
    authGuard: boundSiteContentAuthGuard,
    getActorProfile,
    db: createServerClient() as unknown as MemberDb,
    revalidatePath,
  }
}
