// 后台页面（src/app/[locale]/(app)）的服务端登录检查——第二道门，第一道是
// middleware 里的 updateSession。
//
// 只靠 middleware 不够：它有放行分支（静态资源、公开路径），而后台不少服务端
// 组件是用 service role 直接读库再渲染的，middleware 一旦漏放，页面就把数据
// 原样吐给未登录的人。所以：
//   - (app)/layout.tsx 调一次，整个后台在服务端先确认登录；
//   - 自己在服务端读库的 page.tsx 再各调一次。光靠 layout 不行：客户端路由跳转
//     时 Next 按请求头 Next-Router-State-Tree 只渲染变化的那一段，共享的 layout
//     不重跑，而这个头是客户端自己填的，伪造一下就能只渲染 page、绕开 layout。
// 哪些页面接了哪种检查，钉在 page-guard-wiring.test.ts 的表里。
//
// 本文件不 import next/*，node --test 直接跑；绑定真实依赖只在 require-page-user.ts。

import { defaultLocale, isLocale } from '../../i18n/routing.ts'
import { scopeAllows, scopedHomePath, type AccessArea } from './access-scope.ts'

// 未登录跳到同语言的登录页。locale 来自路由参数，不认识的一律回默认语言，
// 不把原样字符串拼进跳转地址。
export function loginPathForLocale(locale: string | undefined): string {
  return `/${isLocale(locale) ? locale : defaultLocale}/login`
}

export interface PageSessionDeps<U> {
  getUser: () => Promise<U | null>
  redirect: (path: string) => never
}

// 受限帐号（access_scope 非空，见 access-scope.ts）默认跳回它能进的首页；
// 只有写了 { allowScope } 的调用（共享的 layout）放行。
export function createPageSessionGuard<U extends { access_scope?: string | null }>(deps: PageSessionDeps<U>) {
  return async function requirePageUser(
    locale: string | undefined,
    opts?: { allowScope?: AccessArea },
  ): Promise<U> {
    let user: U | null = null
    try {
      user = await deps.getUser()
    } catch {
      // 取会话本身出错（网络、JWKS 拉取失败）按未登录处理，与 middleware 超时
      // 跳登录页的口径一致：宁可多跳一次登录，不放行。
    }
    if (!user) return deps.redirect(loginPathForLocale(locale))
    if (!scopeAllows(user.access_scope ?? null, opts?.allowScope)) {
      return deps.redirect(scopedHomePath(isLocale(locale) ? locale : defaultLocale))
    }
    return user
  }
}
