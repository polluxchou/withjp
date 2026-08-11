export const PUBLIC_SITE_HOST = 'echoamp.agenova.chat'

const DEFAULT_PUBLIC_LOCALE = 'ja'
const PUBLIC_LOCALES = ['zh', 'en', 'ja'] as const

type PublicLocale = (typeof PUBLIC_LOCALES)[number]

export type PublicSiteRoute =
  | { kind: 'passthrough' }
  | { kind: 'redirect'; pathname: string }
  | { kind: 'rewrite'; pathname: string; locale: PublicLocale }
  | { kind: 'not_found' }

const PUBLIC_APPLICATION_PATH = '/api/site/applications'
const PUBLIC_SITE_VIDEO_RE = /^\/site\/(?:[^/]+\/)*[^/]+\.(?:mp4|webm)$/i
const PUBLIC_PAGE_RE = /^\/(?:news(?:\/[^/]+)?|vision|live|services|recruit|contact)?\/?$/

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
  if (normalizeHostname(hostname) !== PUBLIC_SITE_HOST) return null

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
