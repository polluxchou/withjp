import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, isLocale } from '@/i18n/routing'
import { PUBLIC_PATHS } from '@/lib/middleware-matcher'
import { shouldBypassMiddlewareAsset } from '@/lib/middleware-assets'
import { loginPathForLocale } from '@/lib/auth/page-session'
import { accessScopeOf, pageAllowedForScope, scopedHomePath } from '@/lib/auth/access-scope'

function stripLocale(pathname: string) {
  const segments = pathname.split('/')
  return isLocale(segments[1]) ? `/${segments.slice(2).join('/')}` : pathname
}

// 带上 token 刷新时写进 supabaseResponse 的 Cookie，否则跳转后会话丢失。
function redirectWithCookies(url: URL, from: NextResponse) {
  const res = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => res.cookies.set(cookie))
  return res
}

function localizedLoginPath(pathname: string) {
  return loginPathForLocale(pathname.split('/')[1])
}

export async function updateSession(request: NextRequest, extraRequestHeaders?: Headers) {
  const { pathname } = request.nextUrl
  const pathnameWithoutLocale = stripLocale(pathname)

  // extraRequestHeaders carries ONLY the headers callers want injected (e.g.
  // X-NEXT-INTL-LOCALE). Merge lazily at each NextResponse.next() so cookie
  // mutations made by the Supabase token refresh (request.cookies.set above)
  // remain visible to server components — a snapshot taken here would hold a
  // stale cookie header for the rest of the request.
  const requestInit = () => {
    if (!extraRequestHeaders) return { request }
    const headers = new Headers(request.headers)
    extraRequestHeaders.forEach((value, key) => headers.set(key, value))
    return { request: { headers } }
  }

  // Skip Supabase auth check for public paths to avoid network timeout blocking page load
  if (PUBLIC_PATHS.some(p => pathnameWithoutLocale.startsWith(p)) || shouldBypassMiddlewareAsset(pathname)) {
    return NextResponse.next(requestInit())
  }

  let supabaseResponse = NextResponse.next(requestInit())

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
          supabaseResponse = NextResponse.next(requestInit())
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
    // getClaims() verifies the JWT locally via the cached JWKS (asymmetric
    // signing key) instead of a per-navigation round-trip to the Auth server;
    // it still refreshes an expired session through getSession() → setAll.
    const { data } = await Promise.race([
      supabase.auth.getClaims(),
      timeout,
    ])
    if (!data?.claims?.sub) {
      const url = request.nextUrl.clone()
      url.pathname = localizedLoginPath(pathname)
      return NextResponse.redirect(url)
    }
    // 受限帐号（只开竞品，见 access-scope.ts）访问范围外的页面一律送回竞品首页。
    // 这是页面的第一道门；服务端 page 里的守卫是第二道，API 由 authGuard 默认 403。
    if (!pageAllowedForScope(accessScopeOf(data.claims.app_metadata), pathnameWithoutLocale)) {
      const url = request.nextUrl.clone()
      const locale = pathname.split('/')[1]
      url.pathname = scopedHomePath(isLocale(locale) ? locale : defaultLocale)
      url.search = ''
      return redirectWithCookies(url, supabaseResponse)
    }
  } catch {
    const url = request.nextUrl.clone()
    url.pathname = localizedLoginPath(pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
