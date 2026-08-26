import { defaultLocale, locales } from '../../i18n/routing.ts'

// /auth/callback redirects here after exchanging the recovery code. `next`
// comes from a query param an attacker could tamper with. Blacklisting
// individual characters (backslash, etc.) isn't robust — WHATWG URL parsers
// normalize and strip characters (backslash → slash, ASCII tab/CR/LF get
// stripped) in ways that can turn an innocent-looking relative path into a
// protocol-relative URL. Instead, actually parse `next` against a placeholder
// origin and require the resulting host to be unchanged — that's robust to
// any current or future normalization quirk, not just the ones we happened
// to think of.
const PLACEHOLDER_HOST = 'reset-redirect.internal'

function isSameSiteRelativePath(next: string): boolean {
  if (!next.startsWith('/')) return false
  try {
    return new URL(next, `http://${PLACEHOLDER_HOST}`).host === PLACEHOLDER_HOST
  } catch {
    return false
  }
}

export function resolveCallbackRedirect(next: string | null): string {
  if (next && isSameSiteRelativePath(next)) return next
  return `/${defaultLocale}/reset-password`
}

// Used by /auth/callback to decide whether it's safe to attach the
// short-lived recovery-proof token to a resolved redirect target — only
// the reset-password page should ever receive it (see recovery-proof.ts).
export function isResetPasswordPath(path: string): boolean {
  return locales.some((locale) => path === `/${locale}/reset-password`)
}
