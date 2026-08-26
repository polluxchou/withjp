import { defaultLocale } from '../../i18n/routing.ts'

// /auth/callback redirects here after exchanging the recovery code. `next`
// comes from a query param an attacker could tamper with — only allow
// same-site relative paths (leading single slash, not "//..." which
// browsers treat as protocol-relative to an attacker's host).
export function resolveCallbackRedirect(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return `/${defaultLocale}/reset-password`
}
