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

  // allowH2: false 不能删：undici 8 默认对 HTTPS 协商 HTTP/2，而全局 fetch 是 Node
  // 内置的那份 undici，跟这里 npm 装的 dispatcher 不是同一个实例。两者跨实例走 h2 时
  // 响应头里的 content-encoding 会丢，fetch 于是不解压，调用方拿到 gzip 原始字节去
  // JSON.parse（DeepSeek、Supabase 都中过）。与代理无关，换成普通 Agent 也一样坏。
  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import('undici')
  setGlobalDispatcher(new EnvHttpProxyAgent({ allowH2: false }))
  bootstrapped = true
  console.log('[instrumentation] proxy set →', proxy, '| no_proxy:', process.env.NO_PROXY)
}
