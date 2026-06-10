import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { routing, isLocale } from '@/i18n/routing'
import { shouldBypassMiddlewareAsset } from '@/lib/middleware-assets'

const PUBLIC_PATHS = ['/login', '/_next', '/api']
// Matches the constant used by next-intl internally (next-intl/dist/esm/*/shared/constants.js)
const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE'
const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
  // We pass modifiedHeaders into every NextResponse.next() below so the header
  // propagates to server components regardless of which branch runs.
  const modifiedHeaders = new Headers(request.headers)
  modifiedHeaders.set(NEXT_INTL_LOCALE_HEADER, firstSegment)

  if (PUBLIC_PATHS.some((path) => pathnameWithoutLocale.startsWith(path)) || pathname.includes('.')) {
    return NextResponse.next({ request: { headers: modifiedHeaders } })
  }

  const { updateSession } = await import('@/lib/supabase/middleware')
  return await updateSession(request, modifiedHeaders)
}

export const config = {
  // Keep this as a literal string; Next's static analyzer does not resolve
  // imported constants here and falls back to the default middleware matcher.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
