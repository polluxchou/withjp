import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
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
