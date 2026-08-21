import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRequest, describeModel, extractText, llmJson, type LlmModel } from './json.ts'

const GEMINI: LlmModel   = { provider: 'gemini',   model: 'gemini-2.5-pro' }
const DEEPSEEK: LlmModel = { provider: 'deepseek', model: 'deepseek-chat' }

function withEnv<T>(vars: Record<string, string>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v }
  try {
    return fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('describeModel 带上供应商前缀', () => {
  assert.equal(describeModel(GEMINI), 'gemini:gemini-2.5-pro')
  assert.equal(describeModel(DEEPSEEK), 'deepseek:deepseek-chat')
})

test('gemini 请求：key 走 query string，JSON 模式走 responseMimeType', () => {
  withEnv({ GEMINI_API_KEY: 'gk' }, () => {
    const { url, init } = buildRequest(GEMINI, 'hello')
    assert.ok(url.includes('/v1beta/models/gemini-2.5-pro:generateContent'))
    assert.ok(url.includes('key=gk'))
    const headers = init.headers as Record<string, string>
    assert.equal(headers.Authorization, undefined)
    const body = JSON.parse(init.body as string)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.equal(body.generationConfig.temperature, 0)
    assert.deepEqual(body.contents, [{ parts: [{ text: 'hello' }] }])
  })
})

test('deepseek 请求：Bearer 头 + json_object + 小写 json 的 system 指令', () => {
  withEnv({ DEEPSEEK_API_KEY: 'dk' }, () => {
    const { url, init } = buildRequest(DEEPSEEK, 'hello')
    assert.ok(url.endsWith('/chat/completions'))
    const headers = init.headers as Record<string, string>
    assert.equal(headers.Authorization, 'Bearer dk')
    assert.ok(!url.includes('dk'), 'key 不能出现在 URL 里')
    const body = JSON.parse(init.body as string)
    assert.equal(body.model, 'deepseek-chat')
    assert.equal(body.response_format.type, 'json_object')
    assert.equal(body.temperature, 0)
    assert.equal(body.messages.length, 2)
    assert.equal(body.messages[0].role, 'system')
    // json_object 模式要求 prompt 里出现 "json"；大小写 DeepSeek 文档没保证，
    // 所以 system 指令里必须是小写。
    assert.ok(body.messages[0].content.includes('json'))
    assert.equal(body.messages[1].role, 'user')
    assert.equal(body.messages[1].content, 'hello')
  })
})

test('base url 可被 env 覆盖且去掉尾斜杠', () => {
  withEnv({ DEEPSEEK_API_KEY: 'dk', DEEPSEEK_BASE_URL: 'https://proxy.example.com/' }, () => {
    assert.ok(buildRequest(DEEPSEEK, 'x').url.startsWith('https://proxy.example.com/chat/completions'))
  })
})

test('缺 key 时抛错且错误信息里不含 prompt', () => {
  withEnv({ DEEPSEEK_API_KEY: '' }, () => {
    assert.throws(
      () => buildRequest(DEEPSEEK, 'secret prompt'),
      (e: Error) => {
        assert.match(e.message, /DEEPSEEK_API_KEY/)
        assert.doesNotMatch(e.message, /secret prompt/)
        return true
      },
    )
  })
})

test('extractText 各取各家的位置', () => {
  assert.equal(extractText(GEMINI, { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }), '{"a":1}')
  assert.equal(extractText(DEEPSEEK, { choices: [{ message: { content: '{"b":2}' } }] }), '{"b":2}')
})

test('extractText 形状不对时返回空串而不是抛', () => {
  // 调用方拿到空串会走 tryParse 失败 → 降级重试，比抛异常炸掉整条请求好。
  assert.equal(extractText(GEMINI, {}), '')
  assert.equal(extractText(DEEPSEEK, { choices: [] }), '')
  assert.equal(extractText(GEMINI, null), '')
})

test('llmJson 走注入的 fetch，非 2xx 抛错且带上供应商与状态码', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'dk' }, async () => {
    const fetchImpl = (async () => ({
      ok: false, status: 429, statusText: 'Too Many Requests', text: async () => 'rate limited',
    })) as unknown as typeof fetch
    await assert.rejects(
      () => llmJson(DEEPSEEK, 'x', { fetchImpl }),
      (e: Error) => {
        assert.match(e.message, /deepseek/)
        assert.match(e.message, /429/)
        return true
      },
    )
  })
})

test('llmJson 成功时返回模型输出的文本', async () => {
  await withEnv({ GEMINI_API_KEY: 'gk' }, async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
    })) as unknown as typeof fetch
    assert.equal(await llmJson(GEMINI, 'x', { fetchImpl }), '{"ok":true}')
  })
})
