export const MIDDLEWARE_MATCHER =
  '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'

const MIDDLEWARE_PATH_RE =
  /^\/(?!api(?:\/|$)|_next\/static|_next\/image|favicon\.ico$|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*/

export function matchesAppMiddlewarePath(pathname: string) {
  return MIDDLEWARE_PATH_RE.test(pathname)
}
