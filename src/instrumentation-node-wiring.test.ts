import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 设了 HTTPS_PROXY 时，instrumentation-node.ts 把 npm 版 undici 的 EnvHttpProxyAgent
// 装成全局 dispatcher，而全局 fetch 是 Node 内置的另一份 undici。两者跨实例走 HTTP/2
// 时响应头里的 content-encoding 会丢，fetch 不解压，DeepSeek / Supabase 的 gzip 响应
// 直接 JSON.parse 崩（实测 undici 8.2.0 与 8.12.2 都会，关掉 h2 两版都好）。
// 复现要一个本地 TLS + h2 服务端，单测里起不了，只能钉住源码里的这个选项。
const SRC = readFileSync(new URL('./instrumentation-node.ts', import.meta.url), 'utf8')
const CODE = SRC.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')

test('全局代理 dispatcher 关掉 HTTP/2（否则跨实例丢 content-encoding）', () => {
  assert.match(CODE, /setGlobalDispatcher\(new EnvHttpProxyAgent\(\{\s*allowH2:\s*false\s*\}\)\)/)
})

test('只有这一处安装全局 dispatcher', () => {
  assert.equal(CODE.match(/setGlobalDispatcher\(/g)?.length, 1)
})
