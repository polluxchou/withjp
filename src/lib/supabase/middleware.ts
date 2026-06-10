import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, isLocale } from '@/i18n/routing'

const PUBLIC_PATHS = ['/login', '/_next', '/api']

function stripLocale(pathname: string) {
  const segments = pathname.split('/')
  return isLocale(segments[1]) ? `/${segments.slice(2).join('/')}` : pathname
}

function localizedLoginPath(pathname: string) {
  const locale = pathname.split('/')[1]
  return `/${isLocale(locale) ? locale : defaultLocale}/login`
}

export async function updateSession(request: NextRequest, extraRequestHeaders?: Headers) {
  const { pathname } = request.nextUrl
  const pathnameWithoutLocale = stripLocale(pathname)

  // The requestInit lets callers (e.g. middleware) inject extra request headers
  // (like X-NEXT-INTL-LOCALE) that must be visible to server components.
  const requestInit = extraRequestHeaders ? { request: { headers: extraRequestHeaders } } : { request }

  // Skip Supabase auth check for public paths to avoid network timeout blocking page load
  if (PUBLIC_PATHS.some(p => pathnameWithoutLocale.startsWith(p)) || pathname.includes('.')) {
    return NextResponse.next(requestInit)
  }

  let supabaseResponse = NextResponse.next(requestInit)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next(requestInit)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('auth timeout')), 3000)
    )
    const { data: { user } } = await Promise.race([
      supabase.auth.getUser(),
      timeout,
    ])
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = localizedLoginPath(pathname)
      return NextResponse.redirect(url)
    }
  } catch {
    const url = request.nextUrl.clone()
    url.pathname = localizedLoginPath(pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
