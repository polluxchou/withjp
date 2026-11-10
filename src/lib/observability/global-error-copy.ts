import { isPublicSiteHost, PUBLIC_SITE_LOCALES } from '../site/domain-routing.ts'

// global-error.tsx 顶替的是根 layout，渲染时没有 NextIntlClientProvider，取不到 t()。
// 文案的出处仍是 messages/{zh,en,ja}.json 的 errorPages.global；这里是它的一份镜像，
// global-error-copy.test.ts 逐字比对两边，改文案只改 messages、测试会提示同步这里。
// 不直接 import 三个 messages 文件：每个一百多 KB，会整份打进客户端包。
export type BoundaryLocale = 'zh' | 'en' | 'ja'

export interface GlobalErrorCopy {
  title: string
  hint: string
  retry: string
}

export const GLOBAL_ERROR_COPY: Record<BoundaryLocale, GlobalErrorCopy> = {
  zh: { title: '页面出了点问题', hint: '请重试；还是不行的话，稍后再来。', retry: '重试' },
  en: { title: 'Something went wrong', hint: 'Try again, or come back in a little while.', retry: 'Retry' },
  ja: { title: '問題が発生しました', hint: '再試行するか、しばらくしてからもう一度お試しください。', retry: '再試行' },
}

// 后台默认语言（i18n/routing 的 defaultLocale）。那个模块引用 next-intl，这里不引，
// 由测试钉住两边一致。
export const ADMIN_DEFAULT_LOCALE: BoundaryLocale = 'zh'

/**
 * 从地址推语言：路径带语言前缀就用它；不带时官网域名是日文（无前缀路径即默认语言），
 * 其余落回后台默认语言。
 */
export function resolveBoundaryLocale(hostname: string, pathname: string): BoundaryLocale {
  const first = pathname.split('/')[1]
  if (first === 'zh' || first === 'en' || first === 'ja') return first
  return isPublicSiteHost(hostname) ? PUBLIC_SITE_LOCALES[0] : ADMIN_DEFAULT_LOCALE
}
