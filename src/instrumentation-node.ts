// Node.js-only instrumentation — never imported in Edge or browser contexts.
// Called from instrumentation.ts only when NEXT_RUNTIME === 'nodejs'.
//
// Uses undici's EnvHttpProxyAgent so that:
//   - External requests (Supabase, Anthropic, Gemini) route through HTTPS_PROXY
//   - localhost / 127.0.0.1 are excluded via NO_PROXY (Next.js internal calls stay direct)
let bootstrapped = false

export async function registerNodeInstrumentation() {
  if (bootstrapped) return

  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (!proxy) return

  if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_PROXY !== '1') {
    console.log('[instrumentation] proxy skipped in dev; set ENABLE_DEV_PROXY=1 to enable')
    return
  }

  // Ensure Next.js internal server-to-server calls bypass the proxy.
  process.env.NO_PROXY ??= 'localhost,127.0.0.1,::1'

  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import('undici')
  setGlobalDispatcher(new EnvHttpProxyAgent())
  bootstrapped = true
  console.log('[instrumentation] proxy set →', proxy, '| no_proxy:', process.env.NO_PROXY)
}
