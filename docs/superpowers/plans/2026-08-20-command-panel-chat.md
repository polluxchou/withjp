# 命令面板改多轮对话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「用文字操作」从单轮命令条改成右下角非阻断贴角聊天面板 —— 消息流累积、应用成功不关窗、后端多收上一轮做轻上下文。

**Architecture:** 纯逻辑（Turn 模型、上下文派生、输入闸）抽到 `src/lib/intent/` 下的两个 `.ts` 文件，用 `node --test` 做 TDD；UI 拆成四个各司其职的组件（面板壳 / 消息流 / 结果卡 / 输入区）。后端只在 `/api/intent` 与 `parser.ts` 上加一个可选的 `prior` 字段，返回结构完全不动。

**Tech Stack:** Next.js App Router、next-intl、Tailwind（design token，见 `docs/design-system.md`）、`node --test --experimental-strip-types`、zod。

**Spec:** `docs/superpowers/specs/2026-08-20-command-panel-chat-design.md`

---

## 前置事实（实现前必读）

这个仓库有几条不成文规矩，踩错了门禁会红或者更糟——静默失效：

1. **测试跑纯逻辑，没有 jsdom。** `npm test` 是 `node --test --experimental-strip-types` 加一长串显式文件路径。**新测试文件必须手动加进 `package.json` 的 `test` 脚本**，否则永远不会被跑到。React 组件在本仓无法单测——组件正确性靠 Task 11 的实机验证，这是本仓的现实，不是偷懒。
2. **测试文件里 import 要带 `.ts` 后缀**（`from './conversation.ts'`），照 `src/lib/intent/events.test.ts`。
3. **门禁四合一**：`npm run test:copy` = i18n 键三语对齐 + JSX 内禁裸中文 + 设计 token + `next lint --max-warnings=0`。
4. **`check-no-bare-han` 只扫 `.tsx`/`.jsx` 的 JSX 内部。** 所以 `src/lib/intent/*.ts` 里写中文是允许且正确的——`parser.ts` 的 prompt 全是中文。Task 2 里 `outcomeSummary()` 产出的中文**只进 prompt、永不渲染给用户**，不要给它做 i18n。
5. **`check-style-tokens` 必须在最后一次编辑之后跑。** 注释里写 `(#123)` 形式的 PR 编号会被判成裸 hex；要写 PR 编号就写成 `PR 123`。
6. **Tailwind 类名必须是完整字面量**，禁止 `ring-${x}` 拼接（JIT 扫不到，静默失效）。
7. `bg-primary text-white` 是已有先例（`src/components/ui/DateRangeSlider.tsx:123`），不违反 token 门禁。

## File Structure

| 文件 | 职责 |
|---|---|
| 新建 `src/lib/intent/conversation.ts` | `ServerResult` / `PendingActionState` / `Turn` 类型 + 纯函数：`outcomeSummary`、`priorContextOf`、`markSettled` |
| 新建 `src/lib/intent/conversation.test.ts` | 上面四者的单测 |
| 新建 `src/lib/intent/input-gate.ts` | 输入闸纯函数 `sanitizeIntentText`（从 `route.ts` 抽出，`text` 与 `prior` 共用） |
| 新建 `src/lib/intent/input-gate.test.ts` | 输入闸单测 |
| 新建 `src/components/intent/CommandPanel.tsx` | 面板壳：气泡、贴角面板/移动端 sheet、开关、快捷键、portal、提交编排 |
| 新建 `src/components/intent/Transcript.tsx` | 消息流：turns → 气泡、typing、空态示例 chip |
| 新建 `src/components/intent/ResultView.tsx` | 结果卡分发 + 五种 kind 的渲染（从 `CommandBar.tsx` 平移） |
| 新建 `src/components/intent/Composer.tsx` | 输入区：Textarea + 发送 |
| 删除 `src/components/intent/CommandBar.tsx` | 内容全部拆进上面四个文件 |
| 改 `src/components/intent/PendingActionCard.tsx` | 类型改从 `conversation.ts` 导入；加 `settled` prop |
| 改 `src/app/api/intent/route.ts` | 收 `prior`、走输入闸、透传给 parser |
| 改 `src/lib/intent/parser.ts` | `ParserContext.priorTurn`；两处 prompt 注入 |
| 改 `messages/{zh,en,ja}.json` | 新增/删除 `intent.*` 键 |
| 改 `src/app/[locale]/(app)/layout.tsx` `expenses/page.tsx` `guild-venue/page.tsx` | 三处 import 路径改指 `CommandPanel` |
| 改 `docs/design-system.md` | §3 z-index 层级表补一行 |
| 改 `src/lib/changelog/entries.ts` | 2026-08-20 那天补一条 feat |
| 改 `package.json` | `test` 脚本加两个新测试文件 |

---

### Task 1: 输入闸抽成纯函数（TDD）

`route.ts` 现在把 NFKC 归一化、控制字符清洗、长度上限内联在 handler 里。`prior` 要走**同一道**闸，所以先抽出来。

**Files:**
- Create: `src/lib/intent/input-gate.ts`
- Create: `src/lib/intent/input-gate.test.ts`
- Modify: `package.json`（`test` 脚本）
- Modify: `src/app/api/intent/route.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/intent/input-gate.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_INPUT_CHARS, sanitizeIntentText } from './input-gate.ts'

test('sanitizeIntentText 归一化全角字符（NFKC）', () => {
  const r = sanitizeIntentText('Ｑ３　薪资', MAX_INPUT_CHARS)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.text, 'Q3 薪资')
})

test('sanitizeIntentText 把控制字符换成空格并 trim', () => {
  // 控制字符必须写成转义序列。直接粘贴不可见字符的话，下一个人编辑这个文件
  // 时会把它弄丢，断言就永远过不了（或者更糟——变成永真）。
  const r = sanitizeIntentText('\x01新增\x07差旅\x1F', MAX_INPUT_CHARS)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.text, '新增 差旅')
})

test('sanitizeIntentText 空输入报 empty', () => {
  assert.deepEqual(sanitizeIntentText('   ', MAX_INPUT_CHARS), { ok: false, reason: 'empty' })
})

test('sanitizeIntentText 全是控制字符时报 empty_after_sanitize', () => {
  // \x01\x02 不是空白，trim 留得住，所以要走到 replace 之后才变空——
  // 与 reason: 'empty' 是两条不同的路径，别用 '' 测这一条。
  assert.deepEqual(
    sanitizeIntentText('\x01\x02', MAX_INPUT_CHARS),
    { ok: false, reason: 'empty_after_sanitize' },
  )
})

test('sanitizeIntentText 超长报 too_long 并带上原长度', () => {
  const raw = 'a'.repeat(MAX_INPUT_CHARS + 5)
  assert.deepEqual(
    sanitizeIntentText(raw, MAX_INPUT_CHARS),
    { ok: false, reason: 'too_long', length: MAX_INPUT_CHARS + 5 },
  )
})

test('sanitizeIntentText 长度上限按调用方传的值算（prior.outcome 收紧到 300）', () => {
  const raw = 'a'.repeat(301)
  const r = sanitizeIntentText(raw, 300)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'too_long')
})

test('模块级共享的 /g 正则不留 lastIndex 残留', () => {
  // CONTROL_CHARS 带 /g 且是模块级常量。若哪天有人改成用 .test() 复用它，
  // lastIndex 会残留、下一次调用漏掉开头的控制字符。连调两次同一输入必须
  // 得到同一结果——这就是那个回归的守卫。
  const a = sanitizeIntentText('\x01新增\x02', MAX_INPUT_CHARS)
  const b = sanitizeIntentText('\x01新增\x02', MAX_INPUT_CHARS)
  assert.deepEqual(a, b)
  assert.deepEqual(a, { ok: true, text: '新增' })
})
```

把测试文件加进 `package.json` 的 `test` 脚本：在 `src/lib/intent/events.test.ts` 后面插入 ` src/lib/intent/input-gate.test.ts`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL —— `Cannot find module './input-gate.ts'`

- [ ] **Step 3: 写实现**

创建 `src/lib/intent/input-gate.ts`：

```ts
// 意图输入闸——`/api/intent` 的 text 与 prior 两个入口共用同一套清洗规则。
//
// 抽成纯函数而不是留在 route handler 里，是因为 prior（客户端传上来的上一轮
// 上下文）必须跟主 text 走**完全一样**的闸：两处各写一份的话，其中一处漏掉
// NFKC 或控制字符清洗不会有任何测试红给你看。

export const MAX_INPUT_CHARS = 1000

// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g

export type SanitizeResult =
  | { ok: true;  text: string }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'empty_after_sanitize' }
  | { ok: false; reason: 'too_long'; length: number }

export function sanitizeIntentText(raw: string, maxChars: number): SanitizeResult {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (trimmed.length > maxChars) return { ok: false, reason: 'too_long', length: trimmed.length }

  // CONTROL_CHARS 带 /g，String.prototype.replace 每次调用都从 0 开始扫、
  // 结束后把 lastIndex 归零，所以模块级共享这个正则是安全的（.test() 才会
  // 留 lastIndex）。
  const text = trimmed.normalize('NFKC').replace(CONTROL_CHARS, ' ').trim()
  if (!text) return { ok: false, reason: 'empty_after_sanitize' }
  return { ok: true, text }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test 2>&1 | grep -E "input-gate|# (pass|fail)"`
Expected: PASS，`# fail 0`

- [ ] **Step 5: 让 route.ts 改用它**

改 `src/app/api/intent/route.ts`。删掉文件顶部的这两行常量：

```ts
const MAX_INPUT_CHARS = 1000
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g
```

改成 import（加在 `import { VENUE_ITEM_TYPE_OPTIONS } from '@/venue/layoutData'` 后面）：

```ts
import { MAX_INPUT_CHARS, sanitizeIntentText } from '@/lib/intent/input-gate'
```

把「读 rawText → 三段校验 → 得到 text」那一整块（从 `const rawText = (body.text ?? '').trim()` 到 `return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'text is empty after sanitization' }, { status: 400 })` 的闭合大括号）整体替换成：

```ts
  const gated = sanitizeIntentText(body.text ?? '', MAX_INPUT_CHARS)
  if (!gated.ok) {
    const rawText = (body.text ?? '').trim()
    if (gated.reason === 'empty') {
      return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'text is required' }, { status: 400 })
    }
    if (gated.reason === 'too_long') {
      await logIntentViolation({
        userId:  user.id,
        stage:   'input_gate',
        reason:  `text length ${gated.length} > ${MAX_INPUT_CHARS}`,
        rawText: rawText.slice(0, MAX_INPUT_CHARS),
      })
      return NextResponse.json(
        { kind: 'error', code: 'bad_request', message: `text 长度上限为 ${MAX_INPUT_CHARS} 字` },
        { status: 400 },
      )
    }
    await logIntentViolation({
      userId:  user.id,
      stage:   'input_gate',
      reason:  'empty after normalization',
      rawText: rawText.slice(0, 200),
    })
    return NextResponse.json({ kind: 'error', code: 'bad_request', message: 'text is empty after sanitization' }, { status: 400 })
  }
  const text = gated.text
```

- [ ] **Step 6: 确认类型与门禁**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无输出

Run: `npm run test:lint 2>&1 | tail -5`
Expected: 无 error

- [ ] **Step 7: 提交**

```bash
git add src/lib/intent/input-gate.ts src/lib/intent/input-gate.test.ts src/app/api/intent/route.ts package.json
git commit -m "refactor(intent): 输入闸抽成纯函数 + 单测，为 prior 复用同一道闸铺路"
```

---

### Task 2: 对话模型与上下文派生（TDD）

**Files:**
- Create: `src/lib/intent/conversation.ts`
- Create: `src/lib/intent/conversation.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/intent/conversation.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_PRIOR_OUTCOME_CHARS,
  markSettled,
  outcomeSummary,
  priorContextOf,
  type Turn,
} from './conversation.ts'
import type { VenueAction } from '../../venue/layoutData.ts'

const pending = {
  kind: 'pending' as const,
  pendingActionId: 'pa-1',
  op: 'create' as const,
  preview: '新增 差旅费 320 元',
  expiresAt: '2026-08-20T10:00:00.000Z',
}

test('outcomeSummary 待确认动作带上 op 与 preview', () => {
  assert.equal(outcomeSummary(pending), '已暂存一个待确认的 create 操作：新增 差旅费 320 元')
})

test('outcomeSummary 占比查询给出百分比', () => {
  const r = {
    kind: 'query_result' as const,
    breadcrumbs: 'Q3 · 薪资',
    aggregate: 'sum_total' as const,
    numerator: { value: 1200, count: 3 },
    denominator: { value: 4800, count: 12, ratio: 0.25 },
  }
  assert.equal(outcomeSummary(r), '查询结果 25.0%（Q3 · 薪资）')
})

test('outcomeSummary 单值查询给出数值', () => {
  const r = {
    kind: 'query_result' as const,
    breadcrumbs: 'Q3 · 薪资',
    aggregate: 'sum_total' as const,
    numerator: { value: 4800, count: 12 },
  }
  assert.equal(outcomeSummary(r), '查询结果 4800（Q3 · 薪资）')
})

test('outcomeSummary 澄清 / 场地 / 错误各有前缀', () => {
  assert.equal(
    outcomeSummary({ kind: 'clarification', message: '有 3 笔都匹配' }),
    '需要澄清：有 3 笔都匹配',
  )
  assert.equal(
    // VenueAction 的其余字段与本函数无关（它只读 summary），用局部 cast
    // 而不是造一个完整的假 action。
    outcomeSummary({ kind: 'venue_preview', action: { summary: '新增空间 主直播间' } as VenueAction }),
    '场地改动预览：新增空间 主直播间',
  )
  assert.equal(
    outcomeSummary({ kind: 'error', message: '解析失败' }),
    '上一轮失败：解析失败',
  )
})

test('outcomeSummary 截断到上限，避免把长 preview 整段塞进 prompt', () => {
  const long = { ...pending, preview: 'x'.repeat(500) }
  const s = outcomeSummary(long)
  assert.equal(s.length, MAX_PRIOR_OUTCOME_CHARS)
  assert.ok(s.endsWith('…'))
})

test('priorContextOf 取最后一组 user + agent 配对', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',  text: '第一句' },
    { id: '2', role: 'agent', result: { kind: 'error', message: '旧的' } },
    { id: '3', role: 'user',  text: '第二句' },
    { id: '4', role: 'agent', result: { kind: 'clarification', message: '新的' } },
  ]
  assert.deepEqual(priorContextOf(turns), { text: '第二句', outcome: '需要澄清：新的' })
})

test('priorContextOf 跳过 system 气泡', () => {
  const turns: Turn[] = [
    { id: '1', role: 'user',   text: '新增一笔' },
    { id: '2', role: 'agent',  result: pending },
    { id: '3', role: 'system', kind: 'applied' },
  ]
  const prior = priorContextOf(turns)
  assert.equal(prior?.text, '新增一笔')
  assert.ok(prior?.outcome.startsWith('已暂存'))
})

test('priorContextOf 只有 user 没有 agent 时返回 null', () => {
  assert.equal(priorContextOf([{ id: '1', role: 'user', text: '在等回复' }]), null)
})

test('priorContextOf 空数组返回 null', () => {
  assert.equal(priorContextOf([]), null)
})

test('markSettled 只标中目标那条，其余引用不变', () => {
  const a: Turn = { id: '1', role: 'agent', result: pending }
  const b: Turn = { id: '2', role: 'agent', result: pending }
  const out = markSettled([a, b], '2')
  assert.equal(out[0], a)
  assert.notEqual(out[1], b)
  assert.equal(out[1].role === 'agent' && out[1].settled, true)
})

test('markSettled 找不到 id 时原数组原样返回', () => {
  const turns: Turn[] = [{ id: '1', role: 'agent', result: pending }]
  assert.equal(markSettled(turns, 'nope'), turns)
})
```

把 `src/lib/intent/conversation.test.ts` 加进 `package.json` 的 `test` 脚本（紧跟在 `input-gate.test.ts` 后面）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL —— `Cannot find module './conversation.ts'`

- [ ] **Step 3: 写实现**

创建 `src/lib/intent/conversation.ts`：

```ts
// 命令面板的对话状态模型与上下文派生。
//
// 放在 lib 而不是组件里，是因为这三件事（结果 → 一句话摘要、消息流 → 上一轮
// 上下文、标记待确认卡已结算）是本轮唯一能在 node --test 下真正测到的逻辑，
// 也是最容易出错的部分。组件只负责渲染。
//
// 注意：outcomeSummary 产出的中文**只进 parser 的 prompt，永不渲染给用户**，
// 所以它不走 i18n（parser.ts 的 prompt 同样是中文硬编码）。

import type { Expense } from '@/lib/types'
import type { ExpenseWritePayload } from '@/lib/intent/schema'
import type { VenueAction } from '@/venue/layoutData'

// ── 服务端返回结构（镜像 executor 的 ExecuteResult）─────────────

export interface PendingActionState {
  pendingActionId: string
  op:              'create' | 'update' | 'delete'
  preview:         string
  targetId?:       string
  expiresAt:       string
  // 仅「编辑并保存」流程需要：表单要知道原本打算写什么。
  payload?:        ExpenseWritePayload   // create
  patch?:          ExpenseWritePayload   // update
  target?:         Expense               // update / delete
}

export type ServerResult =
  | (PendingActionState & { kind: 'pending' })
  | {
      kind:        'query_result'
      breadcrumbs: string
      aggregate:   'sum_total' | 'count' | 'avg_total' | 'list'
      numerator:   { value: number; count: number }
      denominator?: { value: number; count: number; ratio: number }
      groups?:     { key: string; value: number; count: number }[]
      sample?:     Expense[]
    }
  | { kind: 'clarification'; message: string; candidates?: Expense[] }
  | { kind: 'venue_preview'; action: VenueAction }
  | { kind: 'error'; code?: 'parser_failed' | 'executor_failed' | 'bad_request' | 'unknown'; message: string }

// ── 消息流 ────────────────────────────────────────────────────

export type Turn =
  | { id: string; role: 'user';   text: string }
  | { id: string; role: 'agent';  result: ServerResult; settled?: boolean }
  | { id: string; role: 'system'; kind: 'applied' | 'cancelled' }

export interface PriorContext {
  text:    string
  outcome: string
}

// prompt 里塞太长的上一轮摘要既涨成本又冲淡当前这句话，收到 300 字。
export const MAX_PRIOR_OUTCOME_CHARS = 300

function clamp(s: string): string {
  return s.length <= MAX_PRIOR_OUTCOME_CHARS
    ? s
    : `${s.slice(0, MAX_PRIOR_OUTCOME_CHARS - 1)}…`
}

// 把一个结果压成一句话，供下一轮当上下文。
export function outcomeSummary(result: ServerResult): string {
  switch (result.kind) {
    case 'pending':
      return clamp(`已暂存一个待确认的 ${result.op} 操作：${result.preview}`)
    case 'query_result':
      return clamp(
        result.denominator
          ? `查询结果 ${(result.denominator.ratio * 100).toFixed(1)}%（${result.breadcrumbs}）`
          : `查询结果 ${result.numerator.value}（${result.breadcrumbs}）`,
      )
    case 'clarification':
      return clamp(`需要澄清：${result.message}`)
    case 'venue_preview':
      return clamp(`场地改动预览：${result.action.summary}`)
    case 'error':
      return clamp(`上一轮失败：${result.message}`)
  }
}

// 从消息流里取「上一轮」：最后一个 agent 回复，以及它前面最近的那条 user
// 输入。system 气泡（已应用/已取消）跳过——它不是对话内容。
export function priorContextOf(turns: Turn[]): PriorContext | null {
  let agentIdx = -1
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'agent') { agentIdx = i; break }
  }
  if (agentIdx < 0) return null

  const agent = turns[agentIdx]
  if (agent.role !== 'agent') return null

  for (let i = agentIdx - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role === 'user') {
      return { text: t.text, outcome: outcomeSummary(agent.result) }
    }
  }
  return null
}

// 把某条 agent turn 标成「已结算」（待确认动作已应用或已取消），渲染层据此
// 收起操作按钮，避免同一张卡被点第二次。
export function markSettled(turns: Turn[], id: string): Turn[] {
  const idx = turns.findIndex((t) => t.id === id)
  if (idx < 0) return turns
  const t = turns[idx]
  if (t.role !== 'agent') return turns
  const next = turns.slice()
  next[idx] = { ...t, settled: true }
  return next
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test 2>&1 | grep -E "conversation|# (pass|fail)"`
Expected: PASS，`# fail 0`

- [ ] **Step 5: 提交**

```bash
git add src/lib/intent/conversation.ts src/lib/intent/conversation.test.ts package.json
git commit -m "feat(intent): 对话模型 + 上一轮上下文派生纯函数 + 单测"
```

---

### Task 3: parser 与 API 接上 prior

**Files:**
- Modify: `src/lib/intent/parser.ts`
- Modify: `src/app/api/intent/route.ts`

- [ ] **Step 1: `ParserContext` 加字段，写 prompt 片段构造器**

改 `src/lib/intent/parser.ts`。在文件顶部 import 区加：

```ts
import { MAX_PRIOR_OUTCOME_CHARS, type PriorContext } from './conversation'
```

把 `ParserContext` 改成：

```ts
export interface ParserContext {
  todayISO: string                  // YYYY-MM-DD
  userTimezoneOffset?: string       // e.g. '+08:00'; for prompt context only
  // 上一轮对话（只带一轮）。用于消解「改成 350」「那再加一笔」这类指代。
  // 来源是客户端，属不可信输入：它只进 prompt，不影响任何授权判断，也不
  // 绕过 executor 的字段校验与 per-op 闸门——写操作照旧走 pending_actions
  // 暂存 + 显式确认。这是可以接受客户端传上下文的唯一理由。
  priorTurn?: PriorContext
}
```

在 `buildExtractPrompt` 上方加：

```ts
// 上一轮的 prompt 片段。没有上一轮时返回空串，prompt 与改造前逐字一致——
// 单轮场景的行为不因本次改动漂移。
function priorHint(prior: PriorContext | undefined): string {
  if (!prior) return ''
  return [
    '',
    '【上一轮对话】仅用于消解本句里的指代（「改成 350」「那再加一笔」「上一条」）。',
    `上一轮用户说：${JSON.stringify(prior.text)}`,
    `系统回了：${JSON.stringify(prior.outcome.slice(0, MAX_PRIOR_OUTCOME_CHARS))}`,
    '如果本句自身信息完整，忽略上一轮。',
    '',
  ].join('\n')
}
```

- [ ] **Step 2: 两处 prompt 注入**

把 `buildExtractPrompt` 的 return 改成（只加了一个 `${priorHint(ctx.priorTurn)}`）：

```ts
  return `今天是 ${ctx.todayISO}。

${hint}
${priorHint(ctx.priorTurn)}
${SCHEMA_DOC}
${RULES}

用户输入：${JSON.stringify(text)}`
```

`classifyEntity` 现在签名是 `(text: string)`，改成接收可选 prior：

```ts
export async function classifyEntity(text: string, prior?: PriorContext): Promise<EntityKind> {
```

在它内部构造 prompt 的地方（`const prompt = ...`，约 260 行）把 `priorHint(prior)` 拼进去，位置在原 prompt 的规则段之后、`用户输入：` 之前。**这一处不能省**——「改成 350」单看这句话没有任何实体线索，实体分类器会误路由到 `unknown` 或 `work_task`。

同样给 `parseWorkTaskIntent` 的 prompt 加上 `${priorHint(ctx.priorTurn)}`（它也吃 `ParserContext`）。

- [ ] **Step 3: route.ts 收 prior 并透传**

改 `src/app/api/intent/route.ts`。把 body 的类型加一个字段：

```ts
  let body: {
    text?: string
    scope?: string
    venueItems?: { id: string; name: string; type: string }[]
    prior?: { text?: string; outcome?: string }
  }
```

在 `const text = gated.text` 之后插入 prior 的闸（与主 text 同一个函数，`outcome` 上限收紧）：

```ts
  // prior 走与 text 完全相同的清洗；任一段不合法就整体丢弃 prior（降级成
  // 单轮），不因为上下文脏了就让整次请求失败——上下文是增强项，不是必需项。
  let priorTurn: PriorContext | undefined
  if (body.prior?.text && body.prior?.outcome) {
    const pText    = sanitizeIntentText(body.prior.text, MAX_INPUT_CHARS)
    const pOutcome = sanitizeIntentText(body.prior.outcome, MAX_PRIOR_OUTCOME_CHARS)
    if (pText.ok && pOutcome.ok) {
      priorTurn = { text: pText.text, outcome: pOutcome.text }
    } else {
      await logIntentViolation({
        userId:  user.id,
        stage:   'input_gate',
        reason:  `prior discarded: text=${pText.ok ? 'ok' : pText.reason}, outcome=${pOutcome.ok ? 'ok' : pOutcome.reason}`,
        rawText: text.slice(0, 200),
      })
    }
  }
```

import 补上：

```ts
import { MAX_PRIOR_OUTCOME_CHARS, type PriorContext } from '@/lib/intent/conversation'
```

把 `const ctx = { userId: user.id, channel: 'web' as const, rawText: text }` 下面那行 parser context 的构造改成带上 `priorTurn`。具体三处调用：

```ts
  const entity = await classifyEntity(text, priorTurn)
```

```ts
    const parsed = await parseWorkTaskIntent(text, { todayISO, priorTurn })
```

```ts
    const parsed = await parseExpenseIntent(text, { todayISO, priorTurn })
```

（`parseExpenseIntent` 的实际调用行用 `grep -n "parseExpenseIntent(" src/app/api/intent/route.ts` 定位；venue 分支 `parseVenueIntent` **不接 prior**——场地画布操作是自包含的，加上下文只会引入误改风险。）

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无输出

- [ ] **Step 5: 确认单轮 prompt 没漂移**

Run: `git diff src/lib/intent/parser.ts | grep -E "^[+-].*今天是"`
Expected: 只看到 `${priorHint(ctx.priorTurn)}` 这一处新增，`今天是 ${ctx.todayISO}` 那行本身不变。`priorHint(undefined)` 返回空串，所以无 prior 时 prompt 与改造前逐字相同。

- [ ] **Step 6: 提交**

```bash
git add src/lib/intent/parser.ts src/app/api/intent/route.ts
git commit -m "feat(intent): parser 与 API 接受上一轮上下文（prior），单轮 prompt 不变"
```

---

### Task 4: i18n 键增删（三语）

**Files:**
- Modify: `messages/zh.json`、`messages/en.json`、`messages/ja.json`

- [ ] **Step 1: 三个文件的 `intent` 命名空间各加新键、删旧键**

`messages/zh.json` 的 `intent` 下：删除 `openButtonLabel`、`openButtonTooltip`、`modalTitle`、`placeholder`；保留 `venuePlaceholder`、`venueConfirm`、`venueCancel`、`sendButtonLabel`；新增：

```json
    "bubbleLabel": "用文字操作 (⌘K)",
    "panelTitle": "用文字操作",
    "panelCollapse": "收起",
    "venueScopeTag": "当前画布",
    "composerPlaceholder": "说一句话，我来执行",
    "composerHint": "Enter 发送 · Shift+Enter 换行",
    "emptyGreeting": "说一句话就行。目前支持支出管理和工时任务，示例：",
    "examples": [
      "Q3 薪资中 MC 占了多少",
      "新增差旅费 5月10日打车 320 元",
      "上个月支出最大的三类是什么"
    ],
    "appliedNote": "已应用",
    "cancelledNote": "已取消",
    "thinking": "正在理解…",
```

`messages/en.json` 同一位置：

```json
    "bubbleLabel": "Type to act (⌘K)",
    "panelTitle": "Type to act",
    "panelCollapse": "Collapse",
    "venueScopeTag": "Current canvas",
    "composerPlaceholder": "Say it in one line and I'll do it",
    "composerHint": "Enter to send · Shift+Enter for a new line",
    "emptyGreeting": "Just say it. Expenses and work tasks are supported today. For example:",
    "examples": [
      "How much of Q3 salary went to MC",
      "Add a travel expense: taxi May 10, ¥320",
      "Top three spend categories last month"
    ],
    "appliedNote": "Applied",
    "cancelledNote": "Cancelled",
    "thinking": "Working on it…",
```

`messages/ja.json` 同一位置：

```json
    "bubbleLabel": "テキストで操作 (⌘K)",
    "panelTitle": "テキストで操作",
    "panelCollapse": "折りたたむ",
    "venueScopeTag": "現在のキャンバス",
    "composerPlaceholder": "一言で伝えてください。こちらで実行します",
    "composerHint": "Enter で送信 · Shift+Enter で改行",
    "emptyGreeting": "一言で大丈夫です。現在は支出管理と稼働タスクに対応しています。例：",
    "examples": [
      "Q3の給与のうちMCはどのくらい",
      "5月10日の交通費 320元を追加",
      "先月の支出が多かった上位3カテゴリ"
    ],
    "appliedNote": "適用しました",
    "cancelledNote": "キャンセルしました",
    "thinking": "確認しています…",
```

- [ ] **Step 2: 校验三语键对齐**

Run: `npm run test:i18n 2>&1 | tail -30`
Expected: 键对齐通过。会报「missing references」——`intent.bubbleLabel` 等新键还没有调用方，且 `openButtonLabel` 等旧键的调用方（`CommandBar.tsx`）还在。**这一步先别修**，Task 5–8 换完组件后一起绿。

- [ ] **Step 3: 提交**

```bash
git add messages/zh.json messages/en.json messages/ja.json
git commit -m "i18n(intent): 命令面板对话形态的三语文案（新增 11 键 / 删除 4 键）"
```

---

### Task 5: 结果卡拆成独立文件并改窄面板版式

先把渲染层平移出来，`CommandBar.tsx` 暂时还在、还能跑，减少一次性改动面。

**Files:**
- Create: `src/components/intent/ResultView.tsx`
- Modify: `src/components/intent/PendingActionCard.tsx`

- [ ] **Step 1: PendingActionCard 改类型来源并加 `settled`**

改 `src/components/intent/PendingActionCard.tsx`。删掉本地的 `PendingActionState` 接口定义（第 11–21 行那一整块 `export interface PendingActionState { ... }`）与 `import type { ExpenseWritePayload } from '@/lib/intent/schema'`，改成：

```ts
import type { PendingActionState } from '@/lib/intent/conversation'
import type { ExpenseWritePayload } from '@/lib/intent/schema'

export type { PendingActionState }
```

（`ExpenseWritePayload` 留着，`mergeExpense` / `payloadAsExpense` 还在用。）

`Props` 加一个字段：

```ts
interface Props {
  state:     PendingActionState
  onApplied: () => void
  onCancel:  () => void
  // 已应用 / 已取消后仍留在消息流里：收起操作按钮，避免同一张卡被点第二次。
  settled?:  boolean
}
```

签名与按钮行相应改：

```tsx
export default function PendingActionCard({ state, onApplied, onCancel, settled = false }: Props) {
```

```tsx
      {!settled && (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost"     onClick={cancel} loading={busy === 'cancel'} disabled={busy !== null}>{tCommon('cancel')}</Button>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy !== null}>{tCommon('edit')}</Button>
          )}
          <Button variant="primary"   onClick={apply}  loading={busy === 'apply'}  disabled={busy !== null}>{t('apply')}</Button>
        </div>
      )}
```

- [ ] **Step 2: 建 ResultView.tsx**

创建 `src/components/intent/ResultView.tsx`，把 `CommandBar.tsx` 里 `ResultView` / `VenuePreviewView` / `QueryResultView` / `ClarificationView` / `EmptyHint` / `ErrorView` 六个函数**整段平移**过来，只做四处改动：

1. 顶部加 `'use client'` 与 import：

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import RecordRow from '@/components/ui/RecordRow'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import PendingActionCard from './PendingActionCard'
import { toneOf } from '@/lib/ui/status-tone'
import { FOCUS_RING } from '@/lib/ui/recipes'
import type { ServerResult } from '@/lib/intent/conversation'
import type { VenueAction } from '@/venue/layoutData'
```

2. `ResultView` 改成 default export，并多收一个 `settled`：

```tsx
export default function ResultView({
  result, inputText, settled, onApplied, onCancel, onVenueApply,
}: {
  result:    ServerResult
  inputText: string
  settled:   boolean
  onApplied: () => void
  onCancel:  () => void
  onVenueApply: (action: VenueAction) => void
}) {
  if (result.kind === 'pending') {
    return <PendingActionCard state={result} settled={settled} onApplied={onApplied} onCancel={onCancel} />
  }
  if (result.kind === 'venue_preview') {
    return <VenuePreviewView action={result.action} settled={settled} onConfirm={() => onVenueApply(result.action)} onCancel={onCancel} />
  }
  if (result.kind === 'query_result')   return <QueryResultView r={result} />
  if (result.kind === 'clarification')  return <ClarificationView r={result} />
  return <ErrorView code={result.code} message={result.message} inputText={inputText} />
}
```

3. `VenuePreviewView` 同样吃 `settled`，按钮行包一层：

```tsx
function VenuePreviewView({
  action, settled, onConfirm, onCancel,
}: {
  action:    VenueAction
  settled:   boolean
  onConfirm: () => void
  onCancel:  () => void
}) {
  const t = useTranslations('intent')
  return (
    <div className="space-y-3">
      <div className="bg-canvas border border-line rounded-field p-3 text-sm text-ink-700">
        {action.summary}
      </div>
      {!settled && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('venueCancel')}</Button>
          <Button variant="primary" onClick={onConfirm}>{t('venueConfirm')}</Button>
        </div>
      )}
    </div>
  )
}
```

4. `ClarificationView` 的候选表换成 `RecordRow`。420px 面板里 4 列表的 `minWidth={480}` 意味着**永远在横向滚动**，换成每行一条记录：

```tsx
function ClarificationView({ r }: { r: Extract<ServerResult, { kind: 'clarification' }> }) {
  const t = useTranslations('intent.clarification')
  return (
    <div className="space-y-3">
      <div className="text-sm text-warning-text bg-warning-soft border border-warning-border rounded-field px-3 py-2">
        {r.message}
      </div>
      {r.candidates && r.candidates.length > 0 && (
        <div className="bg-surface border border-line rounded-card overflow-hidden">
          {r.candidates.slice(0, 10).map((c) => (
            <RecordRow
              key={c.id}
              status={toneOf('expense', c.payment_status)}
              title={c.item_name}
              meta={[
                { text: c.expense_date, mono: true },
                { text: c.buyer_name || '—' },
              ]}
              amount={`¥${Number(c.total_price).toLocaleString('zh-CN')}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

`intent.clarification` 下的 `dateCol` / `nameCol` / `amountCol` / `buyerCol` / `tableLabel` 五个键失去调用方——**三语一起删掉**（`check-i18n` 的 unused 检查会提示）。

其余函数（`QueryResultView`、`EmptyHint`、`ErrorView`）逐字平移，不改。`QueryResultView` 的分组表保留 `Table`——三列数值对比就该用表，`Table` 自己已经带 `overflow-x-auto scrollbar-thin`（见 `src/components/ui/Table.tsx:17`）。

- [ ] **Step 3: 让 CommandBar 暂时用新文件**

改 `src/components/intent/CommandBar.tsx`：删掉刚平移走的六个函数，顶部加 `import ResultView from './ResultView'`，把 `ServerResult` 与 `PendingActionState` 的本地定义删掉、改成 `import type { ServerResult } from '@/lib/intent/conversation'`，渲染处补上 `settled={false}`。清理掉不再用到的 import（`Table` 系列、`Copy`、`Check`、`PendingActionCard`）。

- [ ] **Step 4: 类型与 lint**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无输出

Run: `npm run test:lint 2>&1 | tail -5`
Expected: 无 error（未用 import 会被 lint 抓到，这一步就是在验它）

- [ ] **Step 5: 提交**

```bash
git add src/components/intent/ResultView.tsx src/components/intent/PendingActionCard.tsx src/components/intent/CommandBar.tsx messages/zh.json messages/en.json messages/ja.json
git commit -m "refactor(intent): 结果卡拆成 ResultView，澄清候选改 RecordRow 适配窄面板"
```

---

### Task 6: Composer（输入区）

**Files:**
- Create: `src/components/intent/Composer.tsx`

- [ ] **Step 1: 建文件**

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { Loader2, Send } from 'lucide-react'
import type { RefObject } from 'react'
import { Textarea } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'

interface ComposerProps {
  value:       string
  onChange:    (v: string) => void
  onSubmit:    () => void
  busy:        boolean
  placeholder: string
  inputRef:    RefObject<HTMLTextAreaElement | null>
}

export default function Composer({ value, onChange, onSubmit, busy, placeholder, inputRef }: ComposerProps) {
  const t = useTranslations('intent')
  const canSend = value.trim().length > 0 && !busy

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter 发送 / Shift+Enter 换行。输入法组词期间的 Enter 会带
    // isComposing=true，此时发送会把半截拼音提交上去。
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  return (
    <div className="flex-none border-t border-line-soft p-3 space-y-2">
      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          size="sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={busy}
          className="flex-1 text-sm"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label={t('sendButtonLabel')}
          title={t('sendButtonLabel')}
          className={`flex-none w-8 h-8 rounded-field bg-primary text-white place-items-center grid hover:bg-primary-hover disabled:bg-muted-soft disabled:text-ink-400 transition-colors ${FOCUS_RING}`}
        >
          {busy
            ? <Loader2 className="w-[15px] h-[15px] animate-spin" strokeWidth={1.5} />
            : <Send className="w-[15px] h-[15px]" strokeWidth={1.5} />}
        </button>
      </div>
      <p className="text-micro text-ink-400">{t('composerHint')}</p>
    </div>
  )
}
```

- [ ] **Step 2: `Textarea` 支持 ref 了吗**

Run: `grep -n "forwardRef\|TextareaProps" src/components/ui/Field.tsx`
Expected: 看清 `Textarea` 是普通函数组件还是 `forwardRef`。

**如果不是 `forwardRef`**（React 19 下函数组件可以直接收 `ref` 作为普通 prop，但本仓 `Textarea` 把 `...props` 摊到 `<textarea>` 上，`ref` 会跟着透传）：先跑 Step 3 验证；若 ref 拿不到，改成不用 `Textarea` 组件、直接写 `<textarea>` 并复用 `CONTROL_BASE` 是**错的**（会绕过 §6 组件规范）。正确做法是给 `Field.tsx` 的 `Textarea` 包一层 `forwardRef`，并在 `docs/design-system.md` §6.2 的 Field 契约里加一句「Textarea 支持 ref 转发」。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无输出。若报 `ref` 不在 `TextareaProps` 上，按 Step 2 的说明给 `Textarea` 加 `forwardRef`。

- [ ] **Step 4: 提交**

```bash
git add src/components/intent/Composer.tsx src/components/ui/Field.tsx docs/design-system.md
git commit -m "feat(intent): 命令面板输入区（Enter 发送 / Shift+Enter 换行 / 输入法安全）"
```

---

### Task 7: Transcript（消息流）

**Files:**
- Create: `src/components/intent/Transcript.tsx`

- [ ] **Step 1: 建文件**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Sparkles, X } from 'lucide-react'
import ResultView from './ResultView'
import type { Turn } from '@/lib/intent/conversation'
import type { VenueAction } from '@/venue/layoutData'

interface TranscriptProps {
  turns:         Turn[]
  busy:          boolean
  onApplied:     (turnId: string) => void
  onCancelled:   (turnId: string) => void
  onVenueApply:  (turnId: string, action: VenueAction) => void
  onPickExample: (text: string) => void
}

export default function Transcript({
  turns, busy, onApplied, onCancelled, onVenueApply, onPickExample,
}: TranscriptProps) {
  const t = useTranslations('intent')
  const endRef = useRef<HTMLDivElement>(null)

  // 新 turn 落地后滚到底。依赖 turns.length 而不是 turns：结果卡内部状态
  // 变化（比如展开技术细节）不该把视口拽走。
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, busy])

  // focus ring 用 §4 第二配方 ring-inset：本容器是 overflow-y-auto，
  // ring-offset-1 会被裁掉。
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
      {turns.length === 0 && (
        <div className="space-y-2.5">
          <AgentRow>
            <p className="text-sm text-ink-700 leading-relaxed">{t('emptyGreeting')}</p>
          </AgentRow>
          <div className="pl-9 flex flex-col items-start gap-1.5">
            {(t.raw('examples') as string[]).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onPickExample(ex)}
                className="text-left text-xs text-primary-hover bg-primary-soft hover:bg-primary-soft-hover rounded-field px-2.5 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((turn) => {
        if (turn.role === 'user') {
          return (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-card bg-primary-soft px-3 py-2 text-sm text-ink-900 whitespace-pre-wrap break-words">
                {turn.text}
              </div>
            </div>
          )
        }
        if (turn.role === 'system') {
          return (
            <div key={turn.id} className="flex items-center justify-center gap-1.5 text-micro text-ink-400">
              {turn.kind === 'applied'
                ? <Check className="w-3 h-3" strokeWidth={1.5} />
                : <X className="w-3 h-3" strokeWidth={1.5} />}
              {turn.kind === 'applied' ? t('appliedNote') : t('cancelledNote')}
            </div>
          )
        }
        return (
          <AgentRow key={turn.id}>
            <ResultView
              result={turn.result}
              inputText={lastUserTextBefore(turns, turn.id)}
              settled={turn.settled === true}
              onApplied={() => onApplied(turn.id)}
              onCancel={() => onCancelled(turn.id)}
              onVenueApply={(action) => onVenueApply(turn.id, action)}
            />
          </AgentRow>
        )
      })}

      {busy && (
        <AgentRow>
          <div className="flex items-center gap-1 py-1.5">
            <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
            <span className="ml-2 text-micro text-ink-400">{t('thinking')}</span>
          </div>
        </AgentRow>
      )}

      <div ref={endRef} />
    </div>
  )
}

// agent 侧一行：左侧品牌图标 + 内容。图标不承载语义（aria-hidden），
// 说话人身份由「靠左 + 图标」的版式表达，与右侧的用户气泡对称。
function AgentRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="flex-none w-7 h-7 rounded-icon bg-primary-soft grid place-items-center">
        <Sparkles className="w-[15px] h-[15px] text-primary" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  // prefers-reduced-motion 下 Tailwind 的 motion-reduce: 前缀关掉跳动（§4）。
  return (
    <span
      className="w-1 h-1 rounded-full bg-ink-400 animate-bounce motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  )
}

// ErrorView 的「复制报错」要带上是哪句话触发的。找这条 agent turn 前面
// 最近的 user 输入。
function lastUserTextBefore(turns: Turn[], agentTurnId: string): string {
  const idx = turns.findIndex((t) => t.id === agentTurnId)
  for (let i = idx - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role === 'user') return t.text
  }
  return ''
}
```

- [ ] **Step 2: 类型与 lint**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无输出

Run: `npm run test:no-bare-han 2>&1 | tail -5`
Expected: 通过（本文件 JSX 里的中文全部走 `t()`，注释里的中文不在 JSX 内、不算）

- [ ] **Step 3: 提交**

```bash
git add src/components/intent/Transcript.tsx
git commit -m "feat(intent): 消息流（用户气泡 / agent 结果卡 / system 提示 / 空态示例）"
```

---

### Task 8: CommandPanel（面板壳）+ 删掉 CommandBar

**Files:**
- Create: `src/components/intent/CommandPanel.tsx`
- Delete: `src/components/intent/CommandBar.tsx`
- Modify: `src/app/[locale]/(app)/layout.tsx:4`
- Modify: `src/app/[locale]/(app)/expenses/page.tsx:26`
- Modify: `src/app/[locale]/(app)/guild-venue/page.tsx:56`

- [ ] **Step 1: 建 CommandPanel.tsx**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Sparkles, X } from 'lucide-react'
import Tag from '@/components/ui/Tag'
import Transcript from './Transcript'
import Composer from './Composer'
import { notifyIntentApplied } from '@/lib/intent/events'
import { markSettled, priorContextOf, type ServerResult, type Turn } from '@/lib/intent/conversation'
import { FOCUS_RING } from '@/lib/ui/recipes'
import type { VenueAction } from '@/venue/layoutData'

// ── Venue scope registry ──────────────────────────────────────
// 场地编辑器挂载期间注册一个 provider。有 provider 时命令面板把意图限定在
// 当前画布，确认后在客户端把动作应用到画布——它不碰任何其他域。
export type VenueIntentProvider = {
  getItems: () => { id: string; name: string; type: string }[]
  apply: (action: VenueAction) => void
}
let venueProvider: VenueIntentProvider | null = null
const VENUE_PROVIDER_EVENT = 'intent:venue-provider'
export function registerVenueIntent(provider: VenueIntentProvider | null) {
  venueProvider = provider
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(VENUE_PROVIDER_EVENT))
}

// ── 从别处打开 ────────────────────────────────────────────────

const OPEN_EVENT = 'intent:open'

export function openCommandBar(initialText?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { initialText } }))
}

// ── 组件 ──────────────────────────────────────────────────────

export default function CommandPanel() {
  const t = useTranslations('intent')
  const [mounted, setMounted] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [draft,   setDraft]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [turns,   setTurns]   = useState<Turn[]>([])
  const [venueScoped, setVenueScoped] = useState(false)

  const bubbleRef = useRef<HTMLButtonElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  // 单调递增计数器而不是 Date.now()：同一毫秒内 push 两条会撞 React key。
  const seq = useRef(0)
  const nextId = () => `t${++seq.current}`

  useEffect(() => { setMounted(true) }, [])

  // 场地 provider 的挂载状态。
  useEffect(() => {
    const sync = () => setVenueScoped(venueProvider !== null)
    sync()
    window.addEventListener(VENUE_PROVIDER_EVENT, sync)
    return () => window.removeEventListener(VENUE_PROVIDER_EVENT, sync)
  }, [])

  // ⌘K / Ctrl+K 开关。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Escape 收起，焦点还给气泡。不做焦点圈定——这不是 modal。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); bubbleRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // 外部打开事件（支出列表页的空态按钮）。
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ initialText?: string }>).detail
      if (detail?.initialText) setDraft(detail.initialText)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // 打开后聚焦输入框。
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const pushTurn = useCallback((turn: Turn) => {
    setTurns((ts) => [...ts, turn])
  }, [])

  const submit = useCallback(async () => {
    const text = draft.trim()
    if (!text || busy) return

    // prior 从**追加本轮之前**的消息流里派生。
    const prior = priorContextOf(turns)

    setDraft('')
    pushTurn({ id: nextId(), role: 'user', text })
    setBusy(true)
    try {
      const body = {
        text,
        ...(prior ? { prior } : {}),
        ...(venueProvider ? { scope: 'venue', venueItems: venueProvider.getItems() } : {}),
      }
      const res  = await fetch('/api/intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = (await res.json()) as ServerResult
      pushTurn({ id: nextId(), role: 'agent', result: json })
    } catch (err) {
      pushTurn({
        id:     nextId(),
        role:   'agent',
        result: { kind: 'error', message: err instanceof Error ? err.message : String(err) },
      })
    } finally {
      setBusy(false)
    }
  }, [draft, busy, turns, pushTurn])

  // 应用成功：标记该卡已结算 + 追加 system 气泡 + 通知列表页刷新。
  // **不关面板**——这是本轮改动的核心之一。
  const onApplied = useCallback((turnId: string) => {
    notifyIntentApplied()
    setTurns((ts) => [...markSettled(ts, turnId), { id: nextId(), role: 'system', kind: 'applied' }])
  }, [])

  const onCancelled = useCallback((turnId: string) => {
    setTurns((ts) => [...markSettled(ts, turnId), { id: nextId(), role: 'system', kind: 'cancelled' }])
  }, [])

  const onVenueApply = useCallback((turnId: string, action: VenueAction) => {
    venueProvider?.apply(action)
    notifyIntentApplied()
    setTurns((ts) => [...markSettled(ts, turnId), { id: nextId(), role: 'system', kind: 'applied' }])
  }, [])

  const pickExample = useCallback((text: string) => {
    setDraft(text)
    inputRef.current?.focus()
  }, [])

  if (!mounted) return null

  const bubble = (
    <button
      ref={bubbleRef}
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-label={open ? t('panelCollapse') : t('bubbleLabel')}
      title={open ? t('panelCollapse') : t('bubbleLabel')}
      className={`fixed right-5 z-30 w-12 h-12 rounded-full bg-primary text-white place-items-center shadow-pop hover:bg-primary-hover transition-colors ${FOCUS_RING} ${open ? 'hidden md:grid' : 'grid'}`}
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
    >
      {open
        ? <X className="w-[22px] h-[22px]" strokeWidth={1.5} />
        : <Sparkles className="w-[22px] h-[22px]" strokeWidth={1.5} />}
    </button>
  )

  // z-40（下拉/popover 层，见 design-system.md §3）。取保留位 70 会让
  // PendingActionCard 的嵌套编辑 Modal（硬编码 z-60）被盖住而不可用；
  // 取 40 后所有该压住面板的层——移动端抽屉 50、Modal 60、Toast 80——都
  // 自然压住。与页面内 popover 同层，靠 portal 挂载顺序压对。
  const panel = open && (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('panelTitle')}
      className="fixed z-40 flex flex-col bg-surface border border-line shadow-pop
                 inset-x-0 bottom-0 h-[85vh] rounded-t-card
                 md:inset-x-auto md:right-5 md:bottom-[5.5rem] md:w-[420px] md:h-[560px] md:max-h-[calc(100vh-7rem)] md:rounded-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex-none flex items-center gap-2 px-4 py-3 border-b border-line-soft">
        <h2 className="text-sm font-semibold text-ink-900">{t('panelTitle')}</h2>
        {venueScoped && <Tag label={t('venueScopeTag')} tone="violet" size="sm" />}
        <button
          type="button"
          onClick={() => { setOpen(false); bubbleRef.current?.focus() }}
          aria-label={t('panelCollapse')}
          title={t('panelCollapse')}
          className={`ml-auto flex-none w-8 h-8 rounded-icon grid place-items-center text-ink-400 hover:text-ink-700 hover:bg-canvas transition-colors ${FOCUS_RING}`}
        >
          <X className="w-[15px] h-[15px]" strokeWidth={1.5} />
        </button>
      </div>

      <Transcript
        turns={turns}
        busy={busy}
        onApplied={onApplied}
        onCancelled={onCancelled}
        onVenueApply={onVenueApply}
        onPickExample={pickExample}
      />

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        busy={busy}
        placeholder={venueScoped ? t('venuePlaceholder') : t('composerPlaceholder')}
        inputRef={inputRef}
      />
    </div>
  )

  return createPortal(<>{bubble}{panel}</>, document.body)
}
```

- [ ] **Step 2: 删掉 CommandBar.tsx 并改三处 import**

```bash
git rm src/components/intent/CommandBar.tsx
```

`src/app/[locale]/(app)/layout.tsx:4`：

```ts
import CommandPanel from '@/components/intent/CommandPanel'
```

同文件把 `<CommandBar />` 改成 `<CommandPanel />`。

`src/app/[locale]/(app)/expenses/page.tsx:26`：

```ts
import { openCommandBar } from '@/components/intent/CommandPanel'
```

`src/app/[locale]/(app)/guild-venue/page.tsx:56`：

```ts
import { registerVenueIntent } from '@/components/intent/CommandPanel'
```

（函数名保持 `openCommandBar` / `registerVenueIntent` 不改——只是模块换了名字，调用点不需要改动逻辑。spec §3 写的是「调用点不用改」，实际要改的是 import 路径这一行，逻辑确实没动。）

- [ ] **Step 3: 确认没有残留引用**

Run: `grep -rn "CommandBar" src/ docs/design-system.md`
Expected: 只剩 `docs/design-system.md` §3 层级表里的文字描述（Task 9 会一起改）、以及 `CommandPanel.tsx` 里 `openCommandBar` 这个导出名。src/ 下不应再有 `from '@/components/intent/CommandBar'`。

- [ ] **Step 4: 类型 + 四合一门禁**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无输出

Run: `npm run test:copy 2>&1 | tail -30`
Expected: 全绿。若 i18n 报「unused messages」，检查 `intent.clarification.{dateCol,nameCol,amountCol,buyerCol,tableLabel}` 是否已在 Task 5 删净。

- [ ] **Step 5: 提交**

```bash
git add -A src/components/intent src/app messages
git commit -m "feat(intent): 命令面板改成右下角贴角对话面板 + 圆形气泡入口"
```

---

### Task 9: 设计系统登记 + 更新日志

**Files:**
- Modify: `docs/design-system.md`（§3 z-index 层级表）
- Modify: `src/lib/changelog/entries.ts`

- [ ] **Step 1: 改 z-index 层级表**

`docs/design-system.md` §3 那条 `**z-index 层级表**（唯一登记处）` 里，把 `CommandBar 触发药丸` 改成 `CommandPanel 气泡入口`，并把「70 保留未启用」那段说明替换成把面板登记在 40 的版本：

```
- **z-index 层级表**（唯一登记处）：内容 0 · 粘性头 10 · 内容层浮动按钮 30（Sidebar 移动端菜单钮、CommandPanel 气泡入口——开任何遮罩层时被压住是期望行为）· 下拉/popover 40（含 **CommandPanel 贴角面板**）· 移动端抽屉 50 · Modal 60 · Toast/通知 80。**70 保留未启用**：CommandPanel 的贴角面板取 40 而非 70，因为 PendingActionCard 的「编辑并保存」嵌套 Modal 硬编码 z-60——面板取 70 会把那个 Modal 盖在面板不透明的体下面、直接不可用；取 40 后所有该压住面板的层（抽屉 50 / Modal 60 / Toast 80）都自然压住。贴角面板与页面内下拉/popover 同为 40，同屏时靠 portal 挂载顺序压对（面板挂在 body 末尾），且面板固定在右下角、与页面内下拉实际重叠概率低。抽屉遮罩（Sidebar 移动端 backdrop）取值 40，属抽屉层（50）内部构成而非下拉/popover 语义——遮罩恒在抽屉体正下方一起出现/消失，不与真正的下拉/popover 同屏竞争，数值巧合不算冲突
```

- [ ] **Step 2: 加更新日志条目**

`src/lib/changelog/entries.ts` 里 `date: '2026-08-20'` 那个对象的 `items` 数组**顶部**插入：

```ts
      {
        kind: 'feat',
        scope: '用文字操作',
        title: '「用文字操作」改成了能连着聊的对话面板，右下角常驻一个圆气泡',
        details:
          '以前每问一句，上一句的结果就被顶掉了，想对照前后两次查询只能自己记；而且一笔支出确认完窗口就自动关掉，接着要改第二笔得从头点开。现在它是一个贴在右下角的对话面板：问答一条条往下累积，确认完一笔不关窗、原地接着说下一句；面板不遮挡页面，改场地布局时能边看画布边说。紧邻的追问也听得懂了——先说「新增差旅费 5月10日打车 320」，再说「改成 350」，改的就是刚才那一笔。入口从原来的文字药丸换成右下角的圆形气泡，快捷键仍然是 ⌘K，再按一次收起。示例提示从输入框里挪到了面板空白处，点一下就填进输入框。',
      },
```

- [ ] **Step 3: 跑门禁（注意顺序）**

Run: `npm run test:copy 2>&1 | tail -20`
Expected: 全绿。`check-style-tokens` 要在**最后一次编辑之后**跑——上面写的注释里没有 `(#数字)` 形式，不会被误判成裸 hex。

- [ ] **Step 4: 提交**

```bash
git add docs/design-system.md src/lib/changelog/entries.ts
git commit -m "docs(design-system): 登记 CommandPanel 贴角面板 z-40 + 更新日志条目"
```

---

### Task 10: 全量门禁

**Files:** 无（只跑命令）

- [ ] **Step 1: 单测**

Run: `npm test 2>&1 | tail -10`
Expected: `# fail 0`

- [ ] **Step 2: 类型**

Run: `npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 3: 四合一**

Run: `npm run test:copy 2>&1 | tail -20`
Expected: 全绿

- [ ] **Step 4: 构建**

Run: `npm run build 2>&1 | tail -25`
Expected: 编译成功。**特别看有没有 SSR 报错**——`CommandPanel` 是 `'use client'`，被 `(app)/layout.tsx` 直接 import；本仓踩过「client 组件间接 import server 模块导致 SSR 500 且无组件栈」的坑（见 `src/lib/finance-forecast/server-boundary.test.ts` 那一类防线）。`conversation.ts` 只有 `import type`，不会引入运行时依赖，但 build 是唯一能证明这点的地方。

- [ ] **Step 5: 提交（如有 lint 自动修复产生的改动）**

```bash
git status --short
git commit -am "chore: 门禁修正" || echo "无改动"
```

---

### Task 11: 实机验证

worktree 里 `preview_start` 会跑主仓，必须手动起 dev server 并换端口（`package.json` 的 `dev` 固定 3001）。

**Files:** 无

- [ ] **Step 1: 起 dev server**

```bash
npx next dev --port 3011
```

浏览器开 `http://localhost:3011`。

- [ ] **Step 2: 桌面端四条路径**

- [ ] 查询占比：点右下角气泡 → 问「Q3 薪资中 MC 占了多少」→ 确认百分比卡 + 分组表在 420px 里横向可滚（不是被裁掉）
- [ ] 新增支出：「新增差旅费 5月10日打车 320 元」→ 待确认卡 → 点「编辑」→ **嵌套 Modal 必须压在面板之上、可正常操作** → 保存 → 面板**不关**、出现「已应用」提示、待确认卡的按钮行消失
- [ ] 连续两轮的轻上下文：接着说「改成 350」→ 确认改的是刚才那一笔（不是新建一笔）
- [ ] 解析失败：随便说一句「今天天气不错」→ 错误卡 + 「复制报错」按钮可用、`input:` 那行是刚才那句话
- [ ] 场地：进 `/guild-venue` → 面板头部出现「当前画布」标签 → 说「把化妆间旋转90度」→ **面板不遮画布，能同时看到预览和画布** → 应用后画布变化、面板留着

- [ ] **Step 3: 键盘与焦点**

- [ ] ⌘K 打开、再按 ⌘K 收起
- [ ] Escape 收起，焦点回到气泡（按 Tab 看下一个焦点位置）
- [ ] 面板打开时页面**仍可滚动**（非阻断是设计意图，不是 bug）
- [ ] Tab 能走到空态示例 chip 上，focus ring 不被容器裁切
- [ ] 中文输入法组词时按 Enter **不发送**（打「zhongwen」到候选状态按回车）

- [ ] **Step 4: 375px 窄屏**

浏览器 DevTools 切 375×812，刷新：

- [ ] 面板变成底部 sheet（全宽、约 85vh、上圆角）
- [ ] sheet 打开时气泡隐藏，头部的关闭按钮能收起
- [ ] Step 2 的四条路径各跑一遍
- [ ] `RecordRow` 在窄屏隐藏 meta（只剩状态点/名称/金额），不挤压截断

- [ ] **Step 5: 记录结果**

把实际跑通/没跑通的逐条写进 PR 描述。**没跑的项直接写没跑**，不要写「应该没问题」。

---

### Task 12: 开 PR

- [ ] **Step 1: 推分支**

```bash
git push -u origin feat/command-panel-chat
```

- [ ] **Step 2: 开 PR**

```bash
gh pr create --base main --title "feat(intent): 「用文字操作」改成多轮对话面板 + 圆形气泡入口" --body-file -
```

PR 描述里必须有：spec 与本 plan 的链接、Task 11 的实机验证逐条结果（含没跑的项）、z-40 取值理由一句话、以及「查询路径换 DeepSeek 留在下一个 PR」的说明。

结尾加：

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## 遗留给下一个 PR

查询路径换 DeepSeek。四个已知坑记在 spec §8，不在这里重复。抽共享 LLM transport 时顺手消掉 `parser.ts:16` 与 `venue/venue-intent.ts:21` 那两份逐字相同的 `geminiJson` 拷贝。
