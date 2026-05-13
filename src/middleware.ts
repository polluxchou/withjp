import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { routing, isLocale } from '@/i18n/routing'
import { MIDDLEWARE_MATCHER } from '@/lib/middleware-matcher'

const PUBLIC_PATHS = ['/login', '/_next', '/api']
const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // API routes and Next internals must never go through the i18n rewrite —
  // next-intl with localePrefix:'always' would otherwise redirect /api/* to
  // /<locale>/api/*, which has no matching route and returns HTML instead
  // of JSON, breaking every client fetch.
  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next()
  }

  const firstSegment = pathname.split('/')[1]

  if (pathname === '/' || !isLocale(firstSegment)) {
    return intlMiddleware(request)
  }

  const pathnameWithoutLocale = `/${pathname.split('/').slice(2).join('/')}`

  if (PUBLIC_PATHS.some((path) => pathnameWithoutLocale.startsWith(path)) || pathname.includes('.')) {
    return NextResponse.next()
  }

  const { updateSession } = await import('@/lib/supabase/middleware')
  return await updateSession(request)
}

export const config = {
  matcher: [MIDDLEWARE_MATCHER],
}
