# 意图查询路径换 DeepSeek — 设计 + 实现计划

> **For agentic workers:** 步骤用 checkbox（`- [ ]`）跟踪。
> 前置：`docs/superpowers/specs/2026-08-20-command-panel-chat-design.md` §8 圈定了本轮范围。
> 本轮改动比面板那轮小一个量级（一个新模块 + 三个文件 + 一个脚本），设计与计划合成这一份文档，不再单开 spec。

**Goal:** 抽出共享 LLM transport，把意图解析的「快档」从 gemini-2.5-flash 换成 deepseek-chat，解析失败跨供应商降级到 gemini-2.5-pro，并用真实句式跑一轮 A/B 把数据写进 PR。

**Tech Stack:** Gemini `generateContent` / DeepSeek OpenAI 兼容 `chat/completions`、zod、`node --test --experimental-strip-types`

---

## 1. 已确认的决策

| 决策点 | 选定 | 备注 |
|---|---|---|
| 线上默认 | **直接默认 DeepSeek** | 已向用户说明相对时间推理的退步风险（错了不报错、只给错数字），用户在知情下选择默认开启。A/B 作为事后报告；数据难看时用 env 开关退回，不改代码。 |
| 降级阶梯 | **deepseek-chat → gemini-2.5-pro** | 跨供应商，保留今天已知有效的安全网；DeepSeek 整体抓了（频限/宕机）也能自动兑回来。代价是依赖两家供应商。 |
| 换哪些调用点 | parser.ts 里**所有快档调用** | `classify()` / `classifyEntity()` / query 的 `extract()`。pro 档（写操作抽取、工时任务）不动。 |
| venue 解析 | **不换** | `venue-intent.ts:122` 也是快档，但它解析错会静默把画布改坏，本轮留在已知良好的模型上。只做去重，行为不变。 |

## 2. 顺手修一个既有 bug（在改动面正中央）

`extract(text, ctx, kind)` 按 `kind` 选模型（`kind === 'query' ? MODEL_FLASH : MODEL_PRO`）。`parseExpenseIntent` 的降级分支又用**同一个 `kind`** 再调一次 —— 所以 `kind === 'query'` 时「降级」其实是**再跑一遍 flash**，从来没有升到 pro；而返回的 `modelUsed` 被硬编码成 `MODEL_PRO`。

temperature 0 下同 prompt 同模型近似确定性，这个重试基本是空转。

`modelUsed` 全仓没有消费方，所以今天没有人被这个错误的字段误导 —— 真正的缺陷只有「query 路径的降级从不升档」这一条。但换成 DeepSeek 之后这条正好是整个降级设计的意义所在（从 DeepSeek 逃到 Gemini pro），必须一起修。

修法：降级不再复用 `extract` 的 kind 推导，改成显式传入要用的模型。

## 3. 新增模块

### `src/lib/llm/json.ts`

```ts
export type LlmProvider = 'gemini' | 'deepseek'
export interface LlmModel { provider: LlmProvider; model: string }
export interface LlmDeps { fetchImpl?: typeof fetch }

export function describeModel(m: LlmModel): string   // 'deepseek:deepseek-chat'
export function buildRequest(m: LlmModel, prompt: string): { url, init }
export function extractText(m: LlmModel, data: unknown): string
export async function llmJson(m: LlmModel, prompt: string, deps?: LlmDeps): Promise<string>
```

`buildRequest` / `extractText` 拆成导出的纯函数，是为了能在没有网络的 `node --test` 下测两家供应商完全不同的请求体与响应形状 —— 这是本轮唯一值得也能够单测的部分。

两家的差异（都在 `buildRequest` / `extractText` 里）：

| | Gemini | DeepSeek |
|---|---|---|
| 端点 | `{base}/v1beta/models/{model}:generateContent?key=…` | `{base}/chat/completions` |
| 鉴权 | query string 的 `key=` | `Authorization: Bearer` 头 |
| JSON 模式 | `generationConfig.responseMimeType = 'application/json'` | `response_format = {type:'json_object'}` |
| 取文本 | `candidates[0].content.parts[0].text` | `choices[0].message.content` |
| 环境变量 | `GEMINI_API_KEY` / `GEMINI_BASE_URL` | `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` |

**DeepSeek 分支固定加一条 system 消息**：`Output a single valid json object. No prose, no markdown fences.`

两个理由，都不是可选的：① `json_object` 模式要求 prompt 里出现 "json"，现有三条 prompt 写的都是大写 "JSON"，大小写 DeepSeek 文档没保证；② 顺带禁掉 markdown 围栏（`tryParse` 不剥围栏）。Gemini 分支不加，保持现状逐字不变。

现有三条要换的 prompt 都已经在要求返回**对象**（`{"kind":…}` / `{"entity":…}` / discriminated union on op），所以不需要 `{"result":[…]}` 那种包裹层（`venue/translate.ts` 需要包裹是因为它要的是数组）。

### `src/lib/llm/models.ts`

```ts
// INTENT_FAST_PROVIDER: 'deepseek'（默认）| 'gemini'
export function resolveFastModel(env: string | undefined): LlmModel
export const STRONG_MODEL: LlmModel = { provider: 'gemini', model: 'gemini-2.5-pro' }
```

`resolveFastModel` 收 env 值当参数而不是直接读 `process.env`，这样默认值/回退/非法值三种情况都能单测。

**回滚方式**：把 Vercel 的 `INTENT_FAST_PROVIDER` 设成 `gemini` 再触发一次部署 —— 不改代码，但**需要重新部署**才生效（server 代码在模块加载时读 env）。别对外说成「改个开关立刻生效」。

## 4. 文件清单

| 文件 | 动作 |
|---|---|
| `src/lib/llm/json.ts` | 新建：双供应商 JSON transport |
| `src/lib/llm/json.test.ts` | 新建：请求体/响应解析/错误映射单测（注入假 fetch） |
| `src/lib/llm/models.ts` | 新建：快档/强档模型解析 + env 开关 |
| `src/lib/llm/models.test.ts` | 新建：env 解析单测 |
| `src/lib/intent/parser.ts` | 删本地 shim；快档换 `resolveFastModel()`；修降级阶梯 |
| `src/lib/venue/venue-intent.ts` | 删重复 shim，改用 `llmJson`（行为不变，仍走 gemini-2.5-flash） |
| `scripts/llm-ab-intent.mjs` | 新建：真实句式 A/B（准确率 + 延迟） |
| `package.json` | `test` 脚本加两个测试文件 |
| `.env.local.example` | 补 `DEEPSEEK_BASE_URL` / `INTENT_FAST_PROVIDER` 说明 |
| `src/lib/changelog/entries.ts` | 不加条目 —— 用户感知不到模型换了（除非 A/B 显示行为有可见变化，那时再说） |

---

## Task 1: LLM transport（TDD）

**Files:** 新建 `src/lib/llm/json.ts`、`src/lib/llm/json.test.ts`；改 `package.json`

- [ ] **Step 1: 写失败的测试**

`src/lib/llm/json.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRequest, describeModel, extractText, llmJson } from './json.ts'

const GEMINI = { provider: 'gemini', model: 'gemini-2.5-pro' } as const
const DEEPSEEK = { provider: 'deepseek', model: 'deepseek-chat' } as const

function withEnv(vars, fn) {
  const saved = {}
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v }
  try { return fn() } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
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
    assert.equal(init.headers.Authorization, undefined)
    const body = JSON.parse(init.body)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.equal(body.generationConfig.temperature, 0)
    assert.deepEqual(body.contents, [{ parts: [{ text: 'hello' }] }])
  })
})

test('deepseek 请求：Bearer 头 + json_object + 小写 json 的 system 指令', () => {
  withEnv({ DEEPSEEK_API_KEY: 'dk' }, () => {
    const { url, init } = buildRequest(DEEPSEEK, 'hello')
    assert.ok(url.endsWith('/chat/completions'))
    assert.equal(init.headers.Authorization, 'Bearer dk')
    assert.ok(!url.includes('dk'), 'key 不能出现在 URL 里')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'deepseek-chat')
    assert.equal(body.response_format.type, 'json_object')
    assert.equal(body.temperature, 0)
    assert.equal(body.messages.length, 2)
    assert.equal(body.messages[0].role, 'system')
    // json_object 模式要求 prompt 里出现 "json"；大小写 DeepSeek 没保证，
    // 所以 system 指令里必须是小写。
    assert.ok(body.messages[0].content.includes('json'))
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
    assert.throws(() => buildRequest(DEEPSEEK, 'secret prompt'), (e) => {
      assert.ok(/DEEPSEEK_API_KEY/.test(e.message))
      assert.ok(!/secret prompt/.test(e.message))
      return true
    })
  })
})

test('extractText 各取各家的位置', () => {
  assert.equal(extractText(GEMINI, { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }), '{"a":1}')
  assert.equal(extractText(DEEPSEEK, { choices: [{ message: { content: '{"b":2}' } }] }), '{"b":2}')
})

test('extractText 形状不对时返回空串而不是抛', () => {
  // 调用方拿到空串会走 tryParse 失败 → 降级重试，这比抛异常炸掉整条请求好。
  assert.equal(extractText(GEMINI, {}), '')
  assert.equal(extractText(DEEPSEEK, { choices: [] }), '')
})

test('llmJson 走注入的 fetch，非 2xx 抛错且带上供应商与状态码', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'dk' }, async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests', text: async () => 'rate limited' })
    await assert.rejects(
      () => llmJson(DEEPSEEK, 'x', { fetchImpl }),
      (e) => {
        assert.ok(/deepseek/.test(e.message))
        assert.ok(/429/.test(e.message))
        return true
      },
    )
  })
})

test('llmJson 成功时返回模型输出的文本', async () => {
  await withEnv({ GEMINI_API_KEY: 'gk' }, async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }) })
    assert.equal(await llmJson(GEMINI, 'x', { fetchImpl }), '{"ok":true}')
  })
})
```

`package.json` 的 `test` 脚本里，在 `src/lib/intent/conversation.test.ts` 后面插入 ` src/lib/llm/json.test.ts src/lib/llm/models.test.ts`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test 2>&1 | tail -12`
Expected: FAIL — `Cannot find module './json.ts'`

- [ ] **Step 3: 写实现**

`src/lib/llm/json.ts`：

```ts
// 双供应商的「要一段 JSON」传输层。
//
// 抽出来的直接动机是消掉两份重复：src/lib/intent/parser.ts 与
// src/lib/venue/venue-intent.ts 各有一份功能相同的 Gemini shim（文本不完全
// 一致，只差对齐空格）。顺带把 DeepSeek 接进来 —— 意图解析的快档换成它。
//
// buildRequest / extractText 是导出的纯函数：两家的请求体和响应形状完全不同，
// 而 node --test 下没有网络，只有把这两步拆出来才测得到。

export type LlmProvider = 'gemini' | 'deepseek'

export interface LlmModel {
  provider: LlmProvider
  model:    string
}

export interface LlmDeps {
  fetchImpl?: typeof fetch
}

export function describeModel(m: LlmModel): string {
  return `${m.provider}:${m.model}`
}

function requireKey(name: string): string {
  const key = process.env[name]
  // 错误信息里只提变量名，绝不带 prompt —— 它会进日志。
  if (!key) throw new Error(`${name} is not configured`)
  return key
}

function baseUrl(name: string, fallback: string): string {
  return (process.env[name] ?? fallback).replace(/\/$/, '')
}

// DeepSeek 的 json_object 模式要求 prompt 里出现 "json"。现有三条意图 prompt
// 写的是大写 "JSON"，大小写他们文档没保证，所以这里固定补一条小写的；顺带
// 禁掉 markdown 围栏（调用方的 tryParse 不剥围栏）。
const DEEPSEEK_JSON_SYSTEM = 'Output a single valid json object. No prose, no markdown fences.'

export function buildRequest(m: LlmModel, prompt: string): { url: string; init: RequestInit } {
  if (m.provider === 'gemini') {
    const key = requireKey('GEMINI_API_KEY')
    const base = baseUrl('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com')
    return {
      url: `${base}/v1beta/models/${m.model}:generateContent?key=${key}`,
      init: {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      },
    }
  }

  const key = requireKey('DEEPSEEK_API_KEY')
  const base = baseUrl('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
  return {
    url: `${base}/chat/completions`,
    init: {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:    m.model,
        messages: [
          { role: 'system', content: DEEPSEEK_JSON_SYSTEM },
          { role: 'user',   content: prompt },
        ],
        temperature:     0,
        response_format: { type: 'json_object' },
      }),
    },
  }
}

// 形状不符时返回空串而不是抛：调用方拿到空串会走 tryParse 失败 → 降级重试，
// 比抛异常炸掉整条请求好。
export function extractText(m: LlmModel, data: unknown): string {
  const d = data as Record<string, unknown>
  if (m.provider === 'gemini') {
    const cands = d?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined
    return cands?.[0]?.content?.parts?.[0]?.text ?? ''
  }
  const choices = d?.choices as { message?: { content?: string } }[] | undefined
  return choices?.[0]?.message?.content ?? ''
}

export async function llmJson(m: LlmModel, prompt: string, deps?: LlmDeps): Promise<string> {
  const doFetch = deps?.fetchImpl ?? fetch
  const { url, init } = buildRequest(m, prompt)
  const res = await doFetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${describeModel(m)} ${res.status}: ${text}`)
  }
  return extractText(m, await res.json())
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test 2>&1 | grep -E "llm/json|^ℹ (tests|pass|fail)"`
Expected: PASS，`# fail 0`

- [ ] **Step 5: 提交**

```bash
git add src/lib/llm/json.ts src/lib/llm/json.test.ts package.json
git commit -m "feat(llm): 双供应商 JSON transport（gemini + deepseek）+ 单测"
```

---

## Task 2: 模型解析与 env 开关（TDD）

**Files:** 新建 `src/lib/llm/models.ts`、`src/lib/llm/models.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { FAST_DEEPSEEK, FAST_GEMINI, STRONG_MODEL, resolveFastModel } from './models.ts'

test('默认（env 未设）走 deepseek', () => {
  assert.deepEqual(resolveFastModel(undefined), FAST_DEEPSEEK)
})

test("显式 'gemini' 退回 gemini flash", () => {
  assert.deepEqual(resolveFastModel('gemini'), FAST_GEMINI)
})

test("显式 'deepseek' 走 deepseek", () => {
  assert.deepEqual(resolveFastModel('deepseek'), FAST_DEEPSEEK)
})

test('大小写与空白不敏感', () => {
  assert.deepEqual(resolveFastModel('  GEMINI '), FAST_GEMINI)
})

test('非法值退回默认而不是抛 —— 一个拼错的 env 不该让整站的意图解析挂掉', () => {
  assert.deepEqual(resolveFastModel('gemni'), FAST_DEEPSEEK)
  assert.deepEqual(resolveFastModel(''), FAST_DEEPSEEK)
})

test('强档恒为 gemini pro —— 降级要跨供应商才有意义', () => {
  assert.deepEqual(STRONG_MODEL, { provider: 'gemini', model: 'gemini-2.5-pro' })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test 2>&1 | tail -12`
Expected: FAIL — `Cannot find module './models.ts'`

- [ ] **Step 3: 写实现**

```ts
// 意图解析用的模型档位。
//
// 快档（分类 + 查询抽取）默认走 deepseek-chat；强档（写操作抽取、工时任务、
// 以及快档解析失败后的降级）恒为 gemini-2.5-pro —— 降级跨供应商才有意义，
// DeepSeek 整体抓了（频限/宕机）也能兑回来。
//
// resolveFastModel 收 env 值当参数而不是直接读 process.env，是为了让默认、
// 显式回退、非法值三条路径都测得到。

import type { LlmModel } from './json'

export const FAST_DEEPSEEK: LlmModel = { provider: 'deepseek', model: 'deepseek-chat' }
export const FAST_GEMINI:   LlmModel = { provider: 'gemini',   model: 'gemini-2.5-flash' }
export const STRONG_MODEL:  LlmModel = { provider: 'gemini',   model: 'gemini-2.5-pro' }

// INTENT_FAST_PROVIDER: 'deepseek'（默认）| 'gemini'
//
// 回滚：把 Vercel 上这个变量设成 'gemini' 再触发一次部署。不改代码，但**要
// 重新部署**才生效（模块加载时读 env），不是「拨一下立刻生效」。
export function resolveFastModel(env: string | undefined): LlmModel {
  return (env ?? '').trim().toLowerCase() === 'gemini' ? FAST_GEMINI : FAST_DEEPSEEK
}

export function fastModel(): LlmModel {
  return resolveFastModel(process.env.INTENT_FAST_PROVIDER)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `# fail 0`

- [ ] **Step 5: 提交**

```bash
git add src/lib/llm/models.ts src/lib/llm/models.test.ts
git commit -m "feat(llm): 快档/强档模型解析 + INTENT_FAST_PROVIDER 开关 + 单测"
```

---

## Task 3: parser.ts 换档 + 修降级阶梯

**Files:** 改 `src/lib/intent/parser.ts`

- [ ] **Step 1: 删本地 shim，换成共享 transport**

删掉 `geminiApiKey` / `geminiBaseUrl` / `geminiJson` 三个函数与 `MODEL_FLASH` / `MODEL_PRO` 两个常量，顶部改成：

```ts
import { llmJson, type LlmModel } from '@/lib/llm/json'
import { STRONG_MODEL, fastModel } from '@/lib/llm/models'
```

四处 `geminiJson(X, prompt)` 改成 `llmJson(X, prompt)`，其中：

| 位置 | 原 | 新 |
|---|---|---|
| `classify()` | `MODEL_FLASH` | `fastModel()` |
| `extract()` | `kind === 'query' ? MODEL_FLASH : MODEL_PRO` | 见 Step 2 |
| `classifyEntity()` | `MODEL_FLASH` | `fastModel()` |
| `parseWorkTaskIntent()` | `MODEL_PRO` | `STRONG_MODEL` |

- [ ] **Step 2: 修降级阶梯 —— 模型显式传入，不再由 kind 推导**

`extract` 改成收一个 `model` 参数：

```ts
async function extract(
  text:  string,
  ctx:   ParserContext,
  kind:  IntentKind,
  model: LlmModel,
): Promise<{ raw: string; modelUsed: string }> {
  const raw = await llmJson(model, buildExtractPrompt(text, ctx, kind))
  return { raw, modelUsed: describeModel(model) }
}
```

`parseExpenseIntent` 里：

```ts
    const kind = await classify(text)

    // 快档只用于查询；写操作直接上强档（写错了要落库，不省这个钱）。
    const firstModel = kind === 'query' ? fastModel() : STRONG_MODEL
    const first = await extract(text, ctx, kind, firstModel)
    const firstParsed = tryParse(first.raw)
    if (firstParsed.success) {
      return { ok: true, intent: firstParsed.data, classifiedAs: kind, modelUsed: first.modelUsed, durationMs: Date.now() - t0 }
    }

    // 降级：只在首轮不是强档时才有意义，且必须显式用强档重跑。
    //
    // 改造前这里复用 extract 的 kind 推导，于是 kind === 'query' 时「降级」是
    // 再跑一遍同一个快档模型 —— temperature 0 下同 prompt 同模型近似确定性，
    // 那次重试基本是空转，却把 modelUsed 报成了 pro。
    if (describeModel(firstModel) !== describeModel(STRONG_MODEL)) {
      const second = await extract(text, ctx, kind, STRONG_MODEL)
      ...
      modelUsed: second.modelUsed,   // 不再硬编码
```

`describeModel` 记得加进 import。

- [ ] **Step 3: 确认 prompt 一字未改**

Run: `git diff src/lib/intent/parser.ts | grep -E "^[+-]" | grep -vE "^[+-]{3}" | grep -E "今天是|只返回|只输出|输入：|SCHEMA_DOC|RULES"`
Expected: 无输出 —— 本任务只换传输层与模型选择，prompt 文本零改动。任何一行 prompt 出现在 diff 里都要停下来查。

- [ ] **Step 4: 类型 + lint**

Run: `npx tsc --noEmit`
Expected: 无输出

Run: `npm run test:lint 2>&1 | tail -4`
Expected: 无 error

- [ ] **Step 5: 提交**

```bash
git add src/lib/intent/parser.ts
git commit -m "feat(intent): 快档换 deepseek-chat，并修 query 路径降级从不升档的既有 bug"
```

---

## Task 4: venue-intent.ts 去重（行为不变）

**Files:** 改 `src/lib/venue/venue-intent.ts`

- [ ] **Step 1: 删重复 shim**

删掉 `geminiApiKey` / `geminiBaseUrl` / `geminiJson`（第 9-36 行那一段，含 `// ── Minimal Gemini transport` 注释），顶部加：

```ts
import { llmJson } from '@/lib/llm/json'
```

第 122 行附近：

```ts
    const raw = await llmJson({ provider: 'gemini', model: 'gemini-2.5-flash' }, prompt)
```

加一行注释说明为什么这里**不**换 DeepSeek：

```ts
    // 场地解析刻意留在 gemini-2.5-flash：它解析错会静默把画布改坏（用户看到
    // 的是一句看似合理的 summary，点确认就应用了），本轮不动它。要换的话走
    // 同一个 llmJson，改这一行即可。
```

- [ ] **Step 2: 确认这是纯去重**

Run: `git diff src/lib/venue/venue-intent.ts | grep -cE "^\+.*(prompt|schema|zod|VENUE_)"`
Expected: `0` —— 只删了传输层、加了 import 与一行调用，解析逻辑与 prompt 零改动

- [ ] **Step 3: 类型 + 单测**

Run: `npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: 无类型错误，`# fail 0`

- [ ] **Step 4: 提交**

```bash
git add src/lib/venue/venue-intent.ts
git commit -m "refactor(venue): 场地意图解析改用共享 llmJson，消掉第二份 gemini shim"
```

---

## Task 5: 真实句式 A/B

**Files:** 新建 `scripts/llm-ab-intent.mjs`

脚本要回答三个问题，缺一个都不算测过：

1. **相对时间提取对不对** —— 这是 spec §8 记的最脆一环，错了不报错、只给错数字
2. **schema 能不能过** —— DeepSeek 的 json_object 会不会吐出结构不符的东西
3. **延迟差多少** —— 交互式面板里用户能感觉到

- [ ] **Step 1: 写脚本**

`scripts/llm-ab-intent.mjs`：读 `.env.local`，对每条 fixture 同时打两家，比对关键字段，输出准确率与 p50/p95。fixture 覆盖相对时间（`Q3`、`上个月`、`上周`、`最近三个月`）与绝对日期（`5月10日`），每条标注期望的 `op` 与日期区间。

脚本**只读不写**：跑的是 parser 的 prompt，不碰 executor，不落库。

- [ ] **Step 2: 跑一轮**

Run: `node scripts/llm-ab-intent.mjs`
Expected: 输出两家的逐条对比 + 汇总

- [ ] **Step 3: 按数据决定要不要拦**

- 相对时间准确率 DeepSeek 不低于 Gemini，且 p95 延迟在可接受范围 → 保持默认 DeepSeek（用户已选定），数据写进 PR 描述
- **DeepSeek 在相对时间上明显更差** → 默认仍按用户决定保持 DeepSeek，但必须在 PR 描述里**用数字直说退步幅度**，并把 `INTENT_FAST_PROVIDER=gemini` 的回滚方式写在最前面。不擅自改默认值 —— 那是用户在知情下做的决定；但也不能把难看的数据藏起来。

- [ ] **Step 4: 提交**

```bash
git add scripts/llm-ab-intent.mjs
git commit -m "test(llm): 意图解析的 gemini/deepseek 真实句式 A/B 脚本"
```

---

## Task 6: 环境变量文档 + 全量门禁

**Files:** 改 `.env.local.example`

- [ ] **Step 1: 补 env 说明**

`.env.local.example` 里 `DEEPSEEK_API_KEY` 附近加：

```
# 可选，自建代理时用
DEEPSEEK_BASE_URL=
# 意图解析的「快档」供应商：deepseek（默认）| gemini
# 设成 gemini 可把分类与查询抽取退回 gemini-2.5-flash。改完需重新部署才生效。
INTENT_FAST_PROVIDER=
```

- [ ] **Step 2: 全量门禁**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → `# fail 0`
Run: `npx tsc --noEmit` → 无输出
Run: `npm run test:copy 2>&1 | tail -12` → 四项全绿
Run: `npm run build` → **看 `.next/BUILD_ID` 存不存在**，别只看退出码（worktree 缺 env 时 build 会退出码 0 但零产物）

- [ ] **Step 3: 提交并开 PR**

```bash
git push -u origin feat/intent-deepseek-query
```

PR 描述必须有：A/B 的实际数字（含难看的）、`INTENT_FAST_PROVIDER=gemini` 的回滚方式、修掉的降级 bug 的说明、以及「venue 解析刻意没换」。

---

## 明确不做

- venue 解析换 DeepSeek（同一个 `llmJson`，改一行即可，但要单独评估）
- 写操作抽取与工时任务换 DeepSeek（写错了要落库）
- 把 `src/lib/agents/providers.ts` 也并进 `src/lib/llm/`（那是 Agent 域的东西，本轮不碰）
- `modelUsed` 落库做模型级遥测（现在全仓没有消费方；要做是另一件事）
