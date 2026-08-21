import assert from 'node:assert/strict'
import test from 'node:test'

import { deepseekChat, redactCredentials } from './deepseek.ts'

// redactCredentials 是纯字符串逻辑：这条错误信息会经由端点直传、被面板的
// 「复制报错」按钮展示给人看，任何带用户名密码的 URL 片段都必须先脱敏。
test('redactCredentials strips userinfo from a URL embedded in an error message', () => {
  assert.equal(
    redactCredentials('TypeError: Request cannot be constructed from a URL that includes credentials: https://user:pass@127.0.0.1:1/chat/completions'),
    'TypeError: Request cannot be constructed from a URL that includes credentials: https://***@127.0.0.1:1/chat/completions'
  )
})

test('redactCredentials leaves plain URLs and text untouched', () => {
  assert.equal(redactCredentials('DeepSeek 502: upstream unavailable'), 'DeepSeek 502: upstream unavailable')
  assert.equal(redactCredentials('see https://api.deepseek.com/chat/completions'), 'see https://api.deepseek.com/chat/completions')
})

test('redactCredentials handles multiple credentialed URLs in one message', () => {
  assert.equal(
    redactCredentials('a: https://u1:p1@host-a/x, b: https://u2:p2@host-b/y'),
    'a: https://***@host-a/x, b: https://***@host-b/y'
  )
})

// deepseekChat 的凭据 guard：调用真实的公开函数（不 mock fetch），只验证它在
// baseUrl 带凭据时提前短路、且不把凭据回显在 message 里。
test('deepseekChat rejects a DEEPSEEK_BASE_URL that embeds credentials, without echoing it', async () => {
  const prevKey = process.env.DEEPSEEK_API_KEY
  const prevBase = process.env.DEEPSEEK_BASE_URL
  process.env.DEEPSEEK_API_KEY = 'test-key'
  process.env.DEEPSEEK_BASE_URL = 'https://user:pass@internal-proxy.example/v1'
  try {
    const result = await deepseekChat('system', [{ role: 'user', content: 'hi' }])
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.code, 'not_configured')
      assert.equal(result.message, 'DEEPSEEK_BASE_URL must not contain credentials')
      assert.ok(!result.message.includes('user'))
      assert.ok(!result.message.includes('pass'))
    }
  } finally {
    if (prevKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = prevKey
    if (prevBase === undefined) delete process.env.DEEPSEEK_BASE_URL
    else process.env.DEEPSEEK_BASE_URL = prevBase
  }
})

test('deepseekChat still reports not_configured when the API key is missing', async () => {
  const prevKey = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  try {
    const result = await deepseekChat('system', [])
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'not_configured')
  } finally {
    if (prevKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = prevKey
  }
})
