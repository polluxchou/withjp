import { defaultLocale } from '../../i18n/routing.ts'

// /auth/callback redirects here after exchanging the recovery code. `next`
// comes from a query param an attacker could tamper with — only allow
// same-site relative paths (leading single slash, no protocol-relative '//...',
// no backslashes — URL parsers normalize '\' to '/' so '/\evil.com' would
// otherwise become protocol-relative too).
export function resolveCallbackRedirect(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) return next
  return `/${defaultLocale}/reset-password`
}
