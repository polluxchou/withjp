export const MIDDLEWARE_MATCHER =
  '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'

const MIDDLEWARE_PATH_RE =
  /^\/(?!_next\/static|_next\/image|favicon\.ico$|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*/

export function matchesAppMiddlewarePath(pathname: string) {
  return MIDDLEWARE_PATH_RE.test(pathname)
}

// Paths that skip the Supabase session check in updateSession() — either
// because they're the login/reset-password flow itself (checking the
// session there would redirect a not-yet-authenticated user right back to
// login) or because they're framework/API routes with their own auth.
export const PUBLIC_PATHS = ['/login', '/reset-password', '/_next', '/api']

// /auth/* (e.g. /auth/callback) must never go through next-intl's rewrite —
// it has no locale prefix and isn't a locale-prefixed app route. Without this,
// intlMiddleware would redirect it to /zh/auth/callback, a 404.
export function isAuthCallbackPath(pathname: string) {
  return pathname === '/auth' || pathname.startsWith('/auth/')
}
