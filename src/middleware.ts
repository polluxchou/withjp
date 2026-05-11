import { type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { routing, isLocale } from '@/i18n/routing'

const PUBLIC_PATHS = ['/login', '/_next', '/api']
const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
