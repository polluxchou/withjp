import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { routing, isLocale } from '@/i18n/routing'
import { shouldBypassMiddlewareAsset } from '@/lib/middleware-assets'
import { resolvePublicSiteRoute } from '@/lib/site/domain-routing'

// `/site` 是对外公会官网（src/app/[locale]/site）：整站免登录，不能走 Supabase
// 会话检查，否则公网访客会被弹到 /login。
const PUBLIC_PATHS = ['/login', '/_next', '/api', '/site']
// Matches the constant used by next-intl internally (next-intl/dist/esm/*/shared/constants.js)
const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE'
const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // echoamp.agenova.chat 是官网专用域名。先把它与内部后台隔离，再进入原有的
  // i18n / Supabase 会话流程；这样猜中后台页面或 API 路径也只会得到 404。
  const publicSiteRoute = resolvePublicSiteRoute(request.nextUrl.hostname, pathname)
  if (publicSiteRoute) {
    if (publicSiteRoute.kind === 'passthrough') return NextResponse.next()

    if (publicSiteRoute.kind === 'not_found') {
      return new NextResponse('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    const destination = request.nextUrl.clone()
    destination.pathname = publicSiteRoute.pathname

    if (publicSiteRoute.kind === 'redirect') {
      return NextResponse.redirect(destination, 308)
    }

    const headers = new Headers(request.headers)
    headers.set(NEXT_INTL_LOCALE_HEADER, publicSiteRoute.locale)
    return NextResponse.rewrite(destination, { request: { headers } })
  }

  // API routes and Next internals must never go through the i18n rewrite —
  // next-intl with localePrefix:'always' would otherwise redirect /api/* to
  // /<locale>/api/*, which has no matching route and returns HTML instead
  // of JSON, breaking every client fetch.
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    shouldBypassMiddlewareAsset(pathname)
  ) {
    return NextResponse.next()
  }

  const firstSegment = pathname.split('/')[1]

  if (pathname === '/' || !isLocale(firstSegment)) {
    return intlMiddleware(request)
  }

  const pathnameWithoutLocale = `/${pathname.split('/').slice(2).join('/')}`

  // Inject the locale into request headers so the root layout can read it via
  // next/headers and set <html lang="..."> correctly for SSR.
  // intlMiddleware (called above for unknown/root paths) sets this header itself;
  // for known-locale paths we handle auth separately and must set it manually.
  // localeHeader holds ONLY the injected header — updateSession merges it with
  // the live request headers per response, so Supabase token-refresh cookie
  // mutations stay visible to server components.
  const localeHeader = new Headers()
  localeHeader.set(NEXT_INTL_LOCALE_HEADER, firstSegment)

  if (PUBLIC_PATHS.some((path) => pathnameWithoutLocale.startsWith(path)) || pathname.includes('.')) {
    const headers = new Headers(request.headers)
    headers.set(NEXT_INTL_LOCALE_HEADER, firstSegment)
    return NextResponse.next({ request: { headers } })
  }

  const { updateSession } = await import('@/lib/supabase/middleware')
  return await updateSession(request, localeHeader)
}

export const config = {
  // Keep this as a literal string; Next's static analyzer does not resolve
  // imported constants here and falls back to the default middleware matcher.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
