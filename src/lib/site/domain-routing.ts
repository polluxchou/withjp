// 官网对外域名。用列表而不是单个常量：这里最早写死成一个当时还没解析的域名
// （echoamp.agenova.chat），真实配好的是 eacn.agenova.chat，host 对不上就会静静
// 落回后台鉴权流程、访客看到的是内部登录页。以后换/加域名往这里加一行即可，
// 旧域名保留一段时间也不会互相顶掉。
export const PUBLIC_SITE_HOSTS = ['eacn.agenova.chat'] as const

/** 规范域名（生成绝对链接、文档引用时用这个）。 */
export const PUBLIC_SITE_HOST = PUBLIC_SITE_HOSTS[0]

/**
 * 对外官网的语言顺序：日文 → 英文 → 中文。站开在日本、面向日本创作者，日文是
 * 第一语言，所以它排第一、也是默认语言（日文页面走无前缀路径 /vision，中英才带
 * /zh、/en）。语言切换器也按这个顺序列。
 *
 * 内部后台是另一套（`i18n/routing` 里 zh 优先，团队自己用），两边不共用顺序 ——
 * 改这里不会动到后台。
 */
export const PUBLIC_SITE_LOCALES = ['ja', 'en', 'zh'] as const

const DEFAULT_PUBLIC_LOCALE = PUBLIC_SITE_LOCALES[0]

type PublicLocale = (typeof PUBLIC_SITE_LOCALES)[number]

export type PublicSiteRoute =
  | { kind: 'passthrough' }
  | { kind: 'redirect'; pathname: string }
  | { kind: 'rewrite'; pathname: string; locale: PublicLocale }
  | { kind: 'not_found' }

const PUBLIC_APPLICATION_PATH = '/api/site/applications'
const PUBLIC_SITE_VIDEO_RE = /^\/site\/(?:[^/]+\/)*[^/]+\.(?:mp4|webm)$/i
// recruit 允许唯一一个子路径 /recruit/staff（其他招募表单）。
// 这条正则是官网域名下的白名单，漏改会让新页面只在内部域名可用、
// 在 eacn.agenova.chat 上 404 —— 而本地与 preview 都发现不了。
const PUBLIC_PAGE_RE = /^\/(?:news(?:\/[^/]+)?|recruit(?:\/staff)?|vision|live|services|contact)?\/?$/

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '')
}

function splitLocale(pathname: string): { locale: PublicLocale; pathname: string } {
  const match = pathname.match(/^\/(zh|en|ja)(?=\/|$)(.*)$/)
  if (!match) return { locale: DEFAULT_PUBLIC_LOCALE, pathname }

  return {
    locale: match[1] as PublicLocale,
    pathname: match[2] || '/',
  }
}

function cleanPublicPath(locale: PublicLocale, suffix: string): string {
  const normalizedSuffix = suffix === '/' ? '' : suffix
  if (locale === DEFAULT_PUBLIC_LOCALE) return normalizedSuffix || '/'
  return `/${locale}${normalizedSuffix}`
}

export function resolvePublicSiteRoute(
  hostname: string,
  pathname: string,
): PublicSiteRoute | null {
  if (!(PUBLIC_SITE_HOSTS as readonly string[]).includes(normalizeHostname(hostname))) return null

  if (pathname === PUBLIC_APPLICATION_PATH || pathname === `${PUBLIC_APPLICATION_PATH}/`) {
    return { kind: 'passthrough' }
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) return { kind: 'not_found' }
  if (PUBLIC_SITE_VIDEO_RE.test(pathname)) return { kind: 'passthrough' }

  const localized = splitLocale(pathname)
  if (localized.pathname === '/site' || localized.pathname.startsWith('/site/')) {
    const suffix = localized.pathname.slice('/site'.length) || '/'
    if (!PUBLIC_PAGE_RE.test(suffix)) return { kind: 'not_found' }
    return { kind: 'redirect', pathname: cleanPublicPath(localized.locale, suffix) }
  }

  if (!PUBLIC_PAGE_RE.test(localized.pathname)) return { kind: 'not_found' }

  const suffix = localized.pathname === '/' ? '' : localized.pathname.replace(/\/$/, '')
  return {
    kind: 'rewrite',
    pathname: `/${localized.locale}/site${suffix}`,
    locale: localized.locale,
  }
}
