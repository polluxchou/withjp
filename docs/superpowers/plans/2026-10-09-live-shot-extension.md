# 直播间一键截图上传扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个手动触发的 Chrome 扩展：在 TikTok 直播间页面点一下，截下竖屏直播画面、读当前房间与 Following 区块同期竞品的在线人数，用 MCN 后台账号登录后直接写进数据库，弹窗显示日本时间当日的截图/上传计数。

**Architecture:** 扩展（`extensions/live-shot/`，纯 JS、无构建）在点击那一刻用 `chrome.scripting.executeScript` 注入一个由 `liveProbe.ts` 生成的自包含读取函数，再用 `captureVisibleTab` 截图、按画面矩形裁剪。后台新增只认 Bearer 令牌的 `/api/competitors/quick-shot`，业务逻辑照 `src/lib/site/upload-service.ts` 的「handler factory + 注入依赖」模式写在 `src/lib` 里，用 `node --test` 测；`route.ts` 只绑定真实依赖。数据落 `competitor_shots`（加 `created_by`）与新表 `competitor_viewer_readings`。

**Tech Stack:** Chrome Extension MV3、Next.js 14 App Router route handler、Supabase（Auth REST + supabase-js service role）、Postgres 迁移（手工应用）、`node --test --experimental-strip-types`。

**设计文档：** `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`

---

## 执行须知（每个任务开工前都看一遍）

- **工作区**：一律在 `/Users/fengzhou/Code/newWith/.claude/worktrees/live-shot-extension` 里干活，分支 `feat/live-shot-extension`。**每次 commit 前先跑 `git branch --show-current`，必须输出 `feat/live-shot-extension`**；主仓 `/Users/fengzhou/Code/newWith` 是共享工作区，别在那里改文件、切分支。
- **worktree 没有 `.env.local`**：需要环境变量时用主仓的 `/Users/fengzhou/Code/newWith/.env.local`。
- **测试命令**：单测用 `node --test --experimental-strip-types <文件>`；全量用 `npm test`。**新测试文件必须追加进 `package.json` 的 `test` 脚本**，否则 CI 不跑它。
- **`node --test` 不做类型检查**：每个任务提交前额外跑 `npx tsc --noEmit`。纯类型的 import 要写成 `import { type X }` 或 `import type`。
- **注释里别写 `(#123)` 这种 PR 编号**：`check-style-tokens.mjs` 会把它当裸 hex 色值挂 CI。写成 `PR 250`。
- **生产数据库与线上部署是对外动作**：任务 12、14 里标了「先问 pollux」的步骤，必须拿到 pollux 在对话里的明确同意再执行。

## 文件结构

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/lib/competitors/liveProbe.ts` | 改 | `CLIP_FACTORY_SRC` 加 `opts.mute`；`ProbeConfig` 加 `sidebarChannel`，`sidebarReading()` 支持只读 Following 频道 |
| `src/lib/competitors/liveProbe.test.ts` | 改 | 上述两处的测试 |
| `src/lib/competitors/pageReader.ts` | 建 | 扩展注入用的读取函数源码 `PAGE_READER_SRC`、扩展用探针配置、生成文件内容 |
| `src/lib/competitors/pageReader.test.ts` | 建 | 读取函数行为 + 生成文件与源码一致 |
| `scripts/gen-extension-reader.mjs` | 建 | 把 `renderReaderModule()` 写到扩展目录 |
| `extensions/live-shot/generated/page-reader.js` | 生成 | 禁止手改 |
| `src/lib/competitors/quickShot.ts` | 建 | 接口用的纯函数：令牌解析、handle 规范化、日期、读数行组装 |
| `src/lib/competitors/quickShot.test.ts` | 建 | |
| `src/lib/competitors/quickShotService.ts` | 建 | POST/GET 业务逻辑（依赖注入，不 import next） |
| `src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts` | 建 | 401/400/404/201/207/GET 矩阵 |
| `src/app/api/competitors/quick-shot/route.ts` | 建 | 绑定真实依赖、转 NextResponse |
| `supabase/migrations/<时间戳>_competitor_quick_shot.sql` | 建 | `competitor_shots.created_by` + `competitor_viewer_readings` |
| `extensions/live-shot/package.json` | 建 | `"type": "module"`，让 node 测试能 import 扩展里的 ESM |
| `extensions/live-shot/lib/{liveUrl,crop,day,session,view}.js` | 建 | 扩展端纯函数 |
| `extensions/live-shot/lib/lib.test.ts` | 建 | |
| `extensions/live-shot/lib/api.js` + `api.test.ts` | 建 | 登录/续期/上传/取今日数（fetch 与存储可注入） |
| `scripts/gen-extension-config.mjs` | 建 | 从 `.env.local` 生成 `config.local.js`（gitignore） |
| `extensions/live-shot/{manifest.json,popup.html,popup.css,popup.js,README.md}` | 建 | 扩展外壳与弹窗 |
| `.gitignore` | 改 | 忽略 `extensions/live-shot/config.local.js` |
| `src/lib/changelog/entries.ts` | 改 | 更新日志条目 |

---

### Task 0: 已登录页面上核实 Following 频道结构（开工闸门）

2026-10-09 游客态实测：侧栏每个区块是一个 `[data-e2e="live-side-nav-channel"]`，内含标题 `[data-e2e="live-side-nav-channel-title"]` 与若干 `[data-e2e="live-side-nav-item"]`；游客态只有一个频道（「推荐的主播」）。推断：**已登录时 Following 是第一个频道，Suggested 是第二个。** 后面的实现全建立在这条推断上，先核实。

**Files:** 无（只读核实）

- [ ] **Step 1: 请 pollux 在已登录的 Chrome 里打开任一在播竞品直播间，在 DevTools Console 运行：**

```js
[...document.querySelectorAll('[data-e2e="live-side-nav-channel"]')].map((c, i) => ({
  i,
  title: c.querySelector('[data-e2e="live-side-nav-channel-title"]')?.textContent,
  handles: [...c.querySelectorAll('[data-e2e="live-side-nav-item"] [data-e2e="live-side-nav-name"]')].map((n) => n.textContent),
}))
```

- [ ] **Step 2: 按结果决定**

预期：数组长度 2；`i: 0` 的 `title` 是「Following」（或本地化的「关注」「フォロー中」），`handles` 与页面左侧 Following 区显示的账号一致；`i: 1` 是 Suggested。

- 符合 → 继续 Task 1。
- 不符合（只有一个频道、顺序相反、Following 条目不在 channel 容器里）→ **停下，把输出贴给 pollux**，不要自行换判据。

---

### Task 1: `CLIP_FACTORY_SRC` 支持不静音

扩展是人正在看的时候用的，不能动播放器；无人值守采集仍要静音。

**Files:**
- Modify: `src/lib/competitors/liveProbe.ts`（`CLIP_FACTORY_SRC` 开头几行）
- Test: `src/lib/competitors/liveProbe.test.ts`

- [ ] **Step 1: 写失败测试**

在 `liveProbe.test.ts` 里 `test('CLIP_FACTORY_SRC: video 在但还没拿到尺寸时不给 clip，且照样静音', ...)` 之后追加：

```ts
test('CLIP_FACTORY_SRC: opts.mute=false 时不动播放器（扩展里人正在看）', () => {
  const box = { x: 0, y: 0, width: 800, height: 600 }
  const { doc, win, video } = makeVideoDoc(box, 1080, 1920, 'contain', '50% 50%')
  const r = (clipFactory as (w: unknown, d: unknown, o?: unknown) => ReturnType<typeof clipFactory>)(win, doc, { mute: false })
  assert.equal(video.muted, false, '不许静音')
  assert.equal(video.volume, 1, '不许改音量')
  assert.deepEqual(r.clip, clipRect(box, 1080, 1920, 'contain', '50% 50%'), '矩形照算')
})

test('CLIP_FACTORY_SRC: 不传 opts 仍然静音（scripts/live-watch 的调用方不受影响）', () => {
  const box = { x: 0, y: 0, width: 800, height: 600 }
  const { doc, win, video } = makeVideoDoc(box, 1080, 1920, 'contain', '50% 50%')
  clipFactory(win, doc)
  assert.equal(video.muted, true)
  assert.equal(video.volume, 0)
})
```

并把已有的 `clipSource` 测试里的正则改成新签名：

```ts
  assert.match(clipSource(), /^\(function \(win, doc, opts\)/)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts`
Expected: FAIL —「不许静音」那条断言失败（`true !== false`），以及 `clipSource` 正则不匹配。

- [ ] **Step 3: 改实现**

`liveProbe.ts` 里把 `CLIP_FACTORY_SRC` 的开头：

```ts
export const CLIP_FACTORY_SRC = `function (win, doc) {
  function pct(s) { var n = parseFloat(s); return isFinite(n) ? n : 50 }
  var v = doc.querySelector('video')
  if (!v) return { hasVideo: false, ready: false, clip: null }
  v.muted = true
  v.volume = 0
```

改成：

```ts
export const CLIP_FACTORY_SRC = `function (win, doc, opts) {
  function pct(s) { var n = parseFloat(s); return isFinite(n) ? n : 50 }
  // 无人值守采集要静音（挂一整场不能出声）；扩展是人正在看的时候点的，不能动播放器。
  // 不传 opts = 原行为（静音），scripts/live-watch 的调用方不受影响。
  var mute = !opts || opts.mute !== false
  var v = doc.querySelector('video')
  if (!v) return { hasVideo: false, ready: false, clip: null }
  if (mute) {
    v.muted = true
    v.volume = 0
  }
```

同一文件里 `CLIP_FACTORY_SRC` 上方注释第一行「页面里执行的版本：顺手把播放器静音（挂一整场不能出声），」改为「页面里执行的版本：默认顺手把播放器静音（挂一整场不能出声；扩展传 `{ mute: false }` 不静音），」。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 类型检查并提交**

```bash
npx tsc --noEmit
git branch --show-current   # 必须是 feat/live-shot-extension
git add src/lib/competitors/liveProbe.ts src/lib/competitors/liveProbe.test.ts
git commit -m "feat(live-probe): 画面矩形函数可选不静音，供扩展在人观看时使用"
```

---

### Task 2: 探针只读 Following 频道（`sidebarChannel`）

**Files:**
- Modify: `src/lib/competitors/liveProbe.ts`（`ProbeConfig` 类型、`PROBE_FACTORY_SRC` 内 `sidebarReading()`）
- Test: `src/lib/competitors/liveProbe.test.ts`

- [ ] **Step 1: 写失败测试**

在 `liveProbe.test.ts` 的 `test('同期横截面：有名字没人数的条目也要留，记成 viewer:null', ...)` 之后追加：

```ts
// ---- 只读 Following 频道 ----------------------------------------------------
// 2026-10-09 游客态实测：侧栏每个区块是一个 live-side-nav-channel；已登录时第一个是
// Following、第二个是 Suggested。扩展只要 Following，Suggested 不能混进来。

const CHANNEL = '[data-e2e="live-side-nav-channel"]'
function channel(items: FakeEl[]): FakeEl {
  return { textContent: '', querySelectorAll: (s) => (s === '[data-e2e="live-side-nav-item"]' ? items : []) }
}
function coLiveWith(channels: FakeEl[], over: Record<string, unknown>) {
  const all: Record<string, FakeEl[]> = {
    [CHANNEL]: channels,
    '[data-e2e="live-side-nav-item"]': channels.flatMap((c) => c.querySelectorAll!('[data-e2e="live-side-nav-item"]')),
  }
  const doc = makeDoc({ '.chat': el('') }, all, '/@a/live')
  const win = makeWin()
  factory(win, doc, cfg({ ...VIEWER_CFG, ...over }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  return lw.drain()[0].co_live
}

test('同期横截面：设了 sidebarChannel 且有两个频道 → 只取第一个（Following）', () => {
  const following = channel([navItem('a', '99'), navItem('b', '64')])
  const suggested = channel([navItem('stranger', '692')])
  assert.deepEqual(coLiveWith([following, suggested], { sidebarChannel: [CHANNEL] }), [
    { handle: 'a', viewer: '99' },
    { handle: 'b', viewer: '64' },
  ])
})

test('同期横截面：设了 sidebarChannel 但只有一个频道 → null，不拿 Suggested 顶替', () => {
  // 游客态、或关注的人都没在播时只剩 Suggested 一个频道
  const suggested = channel([navItem('stranger', '692')])
  assert.equal(coLiveWith([suggested], { sidebarChannel: [CHANNEL] }), null)
})

test('同期横截面：不设 sidebarChannel 时照旧整页读（分钟级采集器行为不变）', () => {
  const following = channel([navItem('a', '99')])
  const suggested = channel([navItem('stranger', '692')])
  assert.deepEqual(coLiveWith([following, suggested], {}), [
    { handle: 'a', viewer: '99' },
    { handle: 'stranger', viewer: '692' },
  ])
})

test('defaultProbeConfig 不带 sidebarChannel —— 采集器的 cfgKey 不能因此变化', () => {
  assert.equal('sidebarChannel' in defaultProbeConfig(), false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts`
Expected: FAIL —「只取第一个」那条拿到了 3 条（含 `stranger`）；「只有一个频道 → null」那条拿到了数组。

- [ ] **Step 3: 改实现**

`ProbeConfig` 类型里 `chatSubtree: boolean` 之后加：

```ts
  /**
   * 侧栏频道容器的候选选择器。设了 = 同期横截面只读第一个频道（已登录时即 Following），
   * 且页面上频道数不足 2 时报 null（只剩 Suggested）。不设 = 整页读（分钟级采集器现状）。
   */
  sidebarChannel?: string[]
```

`PROBE_FACTORY_SRC` 里把 `function sidebarReading() {` 到 `var items = doc.querySelectorAll(cfg.viewerItem[a]) || []` 这一段：

```js
  function sidebarReading() {
    if (!doc.querySelectorAll) return null
    var out = []
    for (var a = 0; a < cfg.viewerItem.length && !out.length; a++) {
      var items = doc.querySelectorAll(cfg.viewerItem[a]) || []
```

改成：

```js
  /**
   * 侧栏从哪儿读。不设 sidebarChannel = 整页（分钟级采集器，一条不漏）。
   * 设了 = 只读 Following：侧栏每个区块是一个频道容器，已登录时第一个是 Following、
   * 后面是 Suggested；游客态或关注的人都没在播时只剩 Suggested 一个。
   * 所以频道数不足 2 就是「没有 Following 区」，报 null，绝不拿 Suggested 顶替。
   */
  function sidebarRoot() {
    if (!cfg.sidebarChannel || !cfg.sidebarChannel.length) return doc
    for (var k = 0; k < cfg.sidebarChannel.length; k++) {
      var chans = doc.querySelectorAll(cfg.sidebarChannel[k]) || []
      if (chans.length) return chans.length >= 2 ? chans[0] : null
    }
    return null
  }
  function sidebarReading() {
    if (!doc.querySelectorAll) return null
    var root = sidebarRoot()
    if (!root || !root.querySelectorAll) return null
    var out = []
    for (var a = 0; a < cfg.viewerItem.length && !out.length; a++) {
      var items = root.querySelectorAll(cfg.viewerItem[a]) || []
```

（`sidebarReading()` 其余部分不动。）

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts`
Expected: 全部 PASS（含已有的 co_live 用例）。

- [ ] **Step 5: 类型检查并提交**

```bash
npx tsc --noEmit
git branch --show-current
git add src/lib/competitors/liveProbe.ts src/lib/competitors/liveProbe.test.ts
git commit -m "feat(live-probe): 同期横截面可限定只读 Following 频道"
```

---

### Task 3: 扩展注入用的读取函数 `pageReader.ts`

**Files:**
- Create: `src/lib/competitors/pageReader.ts`
- Test: `src/lib/competitors/pageReader.test.ts`
- Modify: `package.json`（`test` 脚本）

- [ ] **Step 1: 写失败测试**

创建 `src/lib/competitors/pageReader.test.ts`：

```ts
// src/lib/competitors/pageReader.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultProbeConfig } from './liveProbe.ts'
import { PAGE_READER_SRC, SIDEBAR_CHANNEL, extensionProbeConfig, renderReaderModule } from './pageReader.ts'

// ---- 假 DOM：只造读取函数会碰到的部分 ----------------------------------------
type Node = { textContent: string; nodeType?: number; querySelector?: (s: string) => Node | null; querySelectorAll?: (s: string) => Node[] }
const el = (t: string): Node => ({ textContent: t, nodeType: 1 })
function navItem(handle: string, count: string): Node {
  const inner: Record<string, Node> = { '[data-e2e="live-side-nav-name"]': el(handle), '[data-e2e="person-count"]': el(count) }
  return { textContent: `${handle} ${count}`, querySelector: (s) => inner[s] ?? null }
}
function channel(items: Node[]): Node {
  return { textContent: '', querySelectorAll: (s) => (s === '[data-e2e="live-side-nav-item"]' ? items : []) }
}

function makePage() {
  const video = { muted: false, volume: 1, videoWidth: 540, videoHeight: 960, readyState: 4, getBoundingClientRect: () => ({ x: 100, y: 0, width: 800, height: 900 }) }
  const roomKids = [el(''), el('Viewers· 99')]
  const room: Node = { textContent: 'Viewers· 99', querySelectorAll: (s) => (s === 'div' ? roomKids : []) }
  const following = channel([navItem('1mb.dear', '103'), navItem('uni.chuuu', '64')])
  const suggested = channel([navItem('stranger', '692')])
  const map: Record<string, unknown> = { video, '[data-e2e="live-chat-container"]': room }
  const all: Record<string, Node[]> = {
    '[data-e2e="live-side-nav-channel"]': [following, suggested],
    '[data-e2e="live-side-nav-item"]': [...following.querySelectorAll!('[data-e2e="live-side-nav-item"]'), ...suggested.querySelectorAll!('[data-e2e="live-side-nav-item"]')],
  }
  const doc = {
    location: { pathname: '/@1mb.dear/live', href: 'https://www.tiktok.com/@1mb.dear/live' },
    querySelector: (s: string) => (map[s] as Node) ?? null,
    querySelectorAll: (s: string) => all[s] ?? [],
    contains: () => true,
  }
  const observers: { disconnected: boolean }[] = []
  const win: Record<string, unknown> = {
    innerWidth: 1600,
    Date: { now: () => 1_760_000_000_000 },
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
    getComputedStyle: () => ({ objectFit: 'contain', objectPosition: '50% 50%' }),
    MutationObserver: class {
      entry = { disconnected: false }
      constructor() { observers.push(this.entry) }
      observe() {}
      disconnect() { this.entry.disconnected = true }
    },
  }
  return { win, doc, video, observers }
}

const reader = new Function(`return (${PAGE_READER_SRC})`)() as (win: unknown, doc: unknown, cfg: unknown) => Record<string, any>

test('读一次：画面矩形、房间面板人数、只含 Following 的同期横截面', () => {
  const { win, doc } = makePage()
  const r = reader(win, doc, extensionProbeConfig())
  assert.equal(r.href, 'https://www.tiktok.com/@1mb.dear/live')
  assert.equal(r.viewportWidth, 1600)
  assert.equal(r.capturedAt, 1_760_000_000_000)
  assert.equal(r.clip.ready, true)
  assert.deepEqual(r.clip.clip, { x: 247, y: 0, width: 506, height: 900 })
  assert.equal(r.viewer, '99')
  assert.equal(r.viewerSource, 'room')
  assert.deepEqual(r.coLive, [
    { handle: '1mb.dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: '64' },
  ])
})

test('读一次：不动播放器', () => {
  const { win, doc, video } = makePage()
  reader(win, doc, extensionProbeConfig())
  assert.equal(video.muted, false)
  assert.equal(video.volume, 1)
})

test('读一次：读完不在页面环境里留探针，observer 已断开', () => {
  const { win, doc, observers } = makePage()
  reader(win, doc, extensionProbeConfig())
  assert.equal(win.__lw, undefined)
  assert.ok(observers.every((o) => o.disconnected), '弹幕 observer 必须断开，否则一直挂在页面上数弹幕')
})

test('连点两次：第二次是全新读数，不复用上一次的探针', () => {
  const { win, doc } = makePage()
  const a = reader(win, doc, extensionProbeConfig())
  const b = reader(win, doc, extensionProbeConfig())
  assert.deepEqual(b.coLive, a.coLive)
  assert.equal(b.viewer, '99')
})

test('extensionProbeConfig：在默认配置上只改 intervalMs 与 sidebarChannel', () => {
  const c = extensionProbeConfig()
  assert.equal(c.intervalMs, 0)
  assert.deepEqual(c.sidebarChannel, SIDEBAR_CHANNEL)
  const { intervalMs: _i, sidebarChannel: _s, ...rest } = c
  const { intervalMs: _d, ...defaults } = defaultProbeConfig()
  assert.deepEqual(rest, defaults)
})

test('renderReaderModule：产出可被扩展 import 的模块文本', () => {
  const src = renderReaderModule()
  assert.match(src, /^\/\/ 自动生成，禁止手改/)
  assert.match(src, /export const PROBE_CONFIG = /)
  assert.match(src, /export function readLivePage\(cfg\) \{/)
  // 去掉 export 关键字后整段是合法 JS，readLivePage 能被取出来
  const body = src.replace(/export /g, '')
  const fn = new Function(`${body}; return readLivePage`)()
  assert.equal(typeof fn, 'function')
})
```

在 `package.json` 的 `test` 脚本末尾（`src/lib/expenses/grouping.test.ts` 之后，引号之前）追加 ` src/lib/competitors/pageReader.test.ts`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/pageReader.test.ts`
Expected: FAIL — `Cannot find module './pageReader.ts'`。

- [ ] **Step 3: 写实现**

创建 `src/lib/competitors/pageReader.ts`：

```ts
// src/lib/competitors/pageReader.ts
// 浏览器扩展 extensions/live-shot 在用户点击那一刻注入直播间页面的「读一次」函数。
// 与 liveProbe.ts 同一原则：产出的是源码字符串，字符串内部零 import、零 TS 语法；
// 在线人数与画面矩形的判据全部复用 PROBE_FACTORY_SRC / CLIP_FACTORY_SRC，扩展里不另写一份。
import { CLIP_FACTORY_SRC, PROBE_FACTORY_SRC, defaultProbeConfig, type ProbeConfig } from './liveProbe.ts'

/** 侧栏频道容器。2026-10-09 实测：每个区块一个，已登录时第一个是 Following。 */
export const SIDEBAR_CHANNEL = ['[data-e2e="live-side-nav-channel"]']

/** 扩展用的探针配置：不起定时器（手动 tick 一次），同期横截面只读 Following。 */
export function extensionProbeConfig(): ProbeConfig {
  return { ...defaultProbeConfig(), intervalMs: 0, sidebarChannel: SIDEBAR_CHANNEL }
}

/**
 * 注入页面执行的读取函数：(win, doc, cfg) → 一次读数。
 * - 画面矩形用 CLIP_FACTORY_SRC，传 { mute: false }：人正在看，不动播放器。
 * - 人数用 PROBE_FACTORY_SRC：先拆掉上一次可能残留的探针，建新探针、tick 一次、
 *   drain、断开、删掉 —— 读完不在页面环境里留任何状态。
 */
export const PAGE_READER_SRC = `function (win, doc, cfg) {
  var probeFactory = ${PROBE_FACTORY_SRC}
  var clipFactory = ${CLIP_FACTORY_SRC}
  var clip = clipFactory(win, doc, { mute: false })
  if (win.__lw && typeof win.__lw.disconnect === 'function') win.__lw.disconnect()
  win.__lw = undefined
  probeFactory(win, doc, cfg)
  var lw = win.__lw
  var sample = null
  if (lw) {
    lw.tick()
    sample = lw.drain()[0] || null
    lw.disconnect()
  }
  win.__lw = undefined
  var loc = (doc && doc.location) || win.location
  return {
    href: loc && loc.href ? String(loc.href) : null,
    viewportWidth: win.innerWidth || 0,
    capturedAt: win.Date.now(),
    clip: clip,
    viewer: sample ? sample.viewer : null,
    viewerSource: sample ? sample.viewer_source : null,
    coLive: sample ? sample.co_live : null
  }
}`

/** extensions/live-shot/generated/page-reader.js 的完整内容。 */
export function renderReaderModule(): string {
  return [
    '// 自动生成，禁止手改。来源：src/lib/competitors/pageReader.ts',
    '// 改了 liveProbe.ts / pageReader.ts 之后重跑：node --experimental-strip-types scripts/gen-extension-reader.mjs',
    '',
    `export const PROBE_CONFIG = ${JSON.stringify(extensionProbeConfig(), null, 2)}`,
    '',
    '// chrome.scripting.executeScript 会把这个函数序列化后注入页面，所以它必须自包含。',
    'export function readLivePage(cfg) {',
    `  return (${PAGE_READER_SRC})(window, document, cfg)`,
    '}',
    '',
  ].join('\n')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/pageReader.test.ts`
Expected: 全部 PASS。若 `clip` 断言的数字不符，先用 `clipRect({x:100,y:0,width:800,height:900}, 540, 960, 'contain', '50% 50%')` 算出真值核对——测试里写的是这个调用的结果，不要为了过测试改实现。

- [ ] **Step 5: 类型检查并提交**

```bash
npx tsc --noEmit
git branch --show-current
git add src/lib/competitors/pageReader.ts src/lib/competitors/pageReader.test.ts package.json
git commit -m "feat(live-shot): 扩展注入用的一次性读取函数，复用 liveProbe 判据"
```

---

### Task 4: 生成脚本 + 生成文件 + 一致性测试

**Files:**
- Create: `scripts/gen-extension-reader.mjs`
- Create（生成）: `extensions/live-shot/generated/page-reader.js`
- Test: `src/lib/competitors/pageReader.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

在 `pageReader.test.ts` 顶部 import 区追加：

```ts
import { readFileSync } from 'node:fs'
```

文件末尾追加：

```ts
test('已提交的 extensions/live-shot/generated/page-reader.js 与源码一致（改了源码要重新生成）', () => {
  const committed = readFileSync(new URL('../../../extensions/live-shot/generated/page-reader.js', import.meta.url), 'utf8')
  assert.equal(
    committed,
    renderReaderModule(),
    '生成文件过期：运行 node --experimental-strip-types scripts/gen-extension-reader.mjs 后一并提交',
  )
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/pageReader.test.ts`
Expected: FAIL — `ENOENT ... page-reader.js`。

- [ ] **Step 3: 写生成脚本并运行**

创建 `scripts/gen-extension-reader.mjs`：

```js
// 生成 extensions/live-shot/generated/page-reader.js：扩展注入直播间页面的读取函数。
// 源头是 src/lib/competitors/pageReader.ts（复用 liveProbe.ts 的判据），生成文件禁止手改。
// 运行：node --experimental-strip-types scripts/gen-extension-reader.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderReaderModule } from '../src/lib/competitors/pageReader.ts'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extensions', 'live-shot', 'generated', 'page-reader.js')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, renderReaderModule())
console.log(`✓ ${out}`)
```

Run: `node --experimental-strip-types scripts/gen-extension-reader.mjs`
Expected: 输出 `✓ .../extensions/live-shot/generated/page-reader.js`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/pageReader.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
npx tsc --noEmit
git branch --show-current
git add scripts/gen-extension-reader.mjs extensions/live-shot/generated/page-reader.js src/lib/competitors/pageReader.test.ts
git commit -m "feat(live-shot): 生成扩展读取函数，测试保证与源码同步"
```

---

### Task 5: 接口纯函数 `quickShot.ts`

**Files:**
- Create: `src/lib/competitors/quickShot.ts`
- Test: `src/lib/competitors/quickShot.test.ts`
- Modify: `package.json`（`test` 脚本追加 ` src/lib/competitors/quickShot.test.ts`）

- [ ] **Step 1: 写失败测试**

创建 `src/lib/competitors/quickShot.test.ts`：

```ts
// src/lib/competitors/quickShot.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bearerToken, buildReadings, indexByHandle, normalizeHandle, parseCoLive,
  parseViewerSource, resolveCapturedAt, shotOnFor, type CompetitorRef,
} from './quickShot.ts'

test('bearerToken：只认 Bearer 方案', () => {
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def')
  assert.equal(bearerToken('bearer abc'), 'abc')
  assert.equal(bearerToken('Basic abc'), null)
  assert.equal(bearerToken('Bearer'), null)
  assert.equal(bearerToken(null), null)
})

test('normalizeHandle：去 @、去空白、转小写；非字符串给空串', () => {
  assert.equal(normalizeHandle(' @1MB.Dear '), '1mb.dear')
  assert.equal(normalizeHandle('heroangels_'), 'heroangels_')
  assert.equal(normalizeHandle(null), '')
  assert.equal(normalizeHandle(42), '')
})

test('resolveCapturedAt：正常用客户端时刻；比服务器快 5 分钟以上或非法就用服务器时间', () => {
  const server = 1_760_000_000_000
  assert.equal(resolveCapturedAt(String(server - 60_000), server), server - 60_000, '弹窗开着等了一分钟再上传，记真实读数时刻')
  assert.equal(resolveCapturedAt(String(server + 4 * 60_000), server), server + 4 * 60_000)
  assert.equal(resolveCapturedAt(String(server + 6 * 60_000), server), server, '本机时钟快了')
  assert.equal(resolveCapturedAt('abc', server), server)
  assert.equal(resolveCapturedAt(null, server), server)
  assert.equal(resolveCapturedAt('0', server), server)
})

test('shotOnFor：按日本时间算日期，UTC 15:00 之后就是日本的第二天', () => {
  assert.equal(shotOnFor(Date.UTC(2026, 9, 8, 14, 59)), '2026-10-08')
  assert.equal(shotOnFor(Date.UTC(2026, 9, 8, 15, 0)), '2026-10-09')
})

test('parseViewerSource：只认三档来源', () => {
  assert.equal(parseViewerSource('room'), 'room')
  assert.equal(parseViewerSource('anchored'), 'anchored')
  assert.equal(parseViewerSource('sole'), 'sole')
  assert.equal(parseViewerSource('sidebar'), null)
  assert.equal(parseViewerSource(null), null)
})

test('parseCoLive：容错解析，handle 规范化，空人数记 null，坏数据丢弃', () => {
  const raw = JSON.stringify([
    { handle: '@1MB.Dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: '' },
    { handle: '', viewer: '5' },
    'junk',
    null,
  ])
  assert.deepEqual(parseCoLive(raw), [
    { handle: '1mb.dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: null },
  ])
  assert.deepEqual(parseCoLive('not json'), [])
  assert.deepEqual(parseCoLive('{"a":1}'), [])
  assert.deepEqual(parseCoLive(null), [])
})

test('parseCoLive：最多收 50 条，防止异常请求灌库', () => {
  const many = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ handle: `h${i}`, viewer: '1' })))
  assert.equal(parseCoLive(many).length, 50)
})

const LIB: CompetitorRef[] = [
  { id: 'c-dear', handle: '1mb.dear', display_name: '1MB DEAR' },
  { id: 'c-uni', handle: 'UNI.CHUUU', display_name: null },
]

test('indexByHandle：按规范化 handle 建索引', () => {
  const m = indexByHandle(LIB)
  assert.equal(m.get('uni.chuuu')?.id, 'c-uni')
  assert.equal(m.get('1mb.dear')?.id, 'c-dear')
})

test('buildReadings：当前房间一行 current + 在库的侧栏条目各一行 sidebar，不在库的丢掉', () => {
  const rows = buildReadings({
    library: indexByHandle(LIB),
    current: { competitorId: 'c-dear', viewerText: '99', viewerSource: 'room' },
    coLive: [
      { handle: '1mb.dear', viewer: '103' },
      { handle: 'uni.chuuu', viewer: '1.3K' },
      { handle: 'stranger', viewer: '692' },
    ],
    capturedAtIso: '2026-10-09T09:42:00.000Z',
    shotId: 'shot-1',
    userId: 'user-1',
  })
  const base = { captured_at: '2026-10-09T09:42:00.000Z', shot_id: 'shot-1', created_by: 'user-1' }
  assert.deepEqual(rows, [
    { ...base, competitor_id: 'c-dear', viewer_count: 99, viewer_text: '99', source: 'current', viewer_source: 'room' },
    { ...base, competitor_id: 'c-dear', viewer_count: 103, viewer_text: '103', source: 'sidebar', viewer_source: null },
    { ...base, competitor_id: 'c-uni', viewer_count: 1300, viewer_text: '1.3K', source: 'sidebar', viewer_source: null },
  ])
})

test('buildReadings：当前房间人数没读到就不写 current 行；侧栏同一账号只留第一条', () => {
  const rows = buildReadings({
    library: indexByHandle(LIB),
    current: { competitorId: 'c-dear', viewerText: null, viewerSource: null },
    coLive: [{ handle: 'uni.chuuu', viewer: null }, { handle: 'uni.chuuu', viewer: '64' }],
    capturedAtIso: '2026-10-09T09:42:00.000Z',
    shotId: 'shot-1',
    userId: 'user-1',
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].source, 'sidebar')
  assert.equal(rows[0].viewer_count, null)
  assert.equal(rows[0].viewer_text, null)
})
```

在 `package.json` 的 `test` 脚本末尾追加 ` src/lib/competitors/quickShot.test.ts`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/quickShot.test.ts`
Expected: FAIL — `Cannot find module './quickShot.ts'`。

- [ ] **Step 3: 写实现**

创建 `src/lib/competitors/quickShot.ts`：

```ts
// src/lib/competitors/quickShot.ts
// 浏览器扩展一键上传（/api/competitors/quick-shot）用到的纯函数。零副作用，node --test 直接测。
import { isoDateInTimeZone } from './cadence.ts'
import { parseCount } from './metrics.ts'

export const QUICK_SHOT_TAG = 'live_manual'
const SHOT_TZ = 'Asia/Tokyo'
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const MAX_CO_LIVE = 50

export type ViewerSource = 'room' | 'anchored' | 'sole'
export type CoLiveEntry = { handle: string; viewer: string | null }
export type CompetitorRef = { id: string; handle: string; display_name: string | null }
export type ReadingRow = {
  competitor_id: string
  captured_at: string
  viewer_count: number | null
  viewer_text: string | null
  source: 'current' | 'sidebar'
  viewer_source: ViewerSource | null
  shot_id: string
  created_by: string
}

/** `Authorization: Bearer <token>` → token；其它方案一律 null。 */
export function bearerToken(header: string | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

/** handle 统一成库里比对用的形态：去 @、去空白、小写。非字符串给空串。 */
export function normalizeHandle(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^@/, '').toLowerCase()
}

/**
 * 读数时刻用客户端传的（弹窗开着等一会儿再上传，记的应是读数那一刻）；
 * 非法、或比服务器快 5 分钟以上（本机时钟异常）就改用服务器时间。
 */
export function resolveCapturedAt(clientMs: unknown, serverMs: number): number {
  const n = typeof clientMs === 'string' ? Number(clientMs) : clientMs
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return serverMs
  if (n > serverMs + MAX_FUTURE_SKEW_MS) return serverMs
  return Math.round(n)
}

/** 归档日期 = 读数时刻的日本时间日期，与自动巡检的 shot_on 同一口径。 */
export function shotOnFor(ms: number): string {
  return isoDateInTimeZone(new Date(ms), SHOT_TZ)
}

export function parseViewerSource(raw: unknown): ViewerSource | null {
  return raw === 'room' || raw === 'anchored' || raw === 'sole' ? raw : null
}

/** 扩展传来的 Following 侧栏条目（JSON 字符串）→ 规范化后的列表；坏数据丢弃，最多 50 条。 */
export function parseCoLive(raw: unknown): CoLiveEntry[] {
  if (typeof raw !== 'string' || raw === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: CoLiveEntry[] = []
  for (const it of parsed.slice(0, MAX_CO_LIVE)) {
    if (!it || typeof it !== 'object') continue
    const handle = normalizeHandle((it as { handle?: unknown }).handle)
    if (!handle) continue
    const v = (it as { viewer?: unknown }).viewer
    out.push({ handle, viewer: typeof v === 'string' && v.trim() ? v.trim() : null })
  }
  return out
}

export function indexByHandle(rows: CompetitorRef[]): Map<string, CompetitorRef> {
  const m = new Map<string, CompetitorRef>()
  for (const r of rows) {
    const h = normalizeHandle(r.handle)
    if (h && !m.has(h)) m.set(h, r)
  }
  return m
}

/**
 * 一次点击要写的人数读数：
 * - current：当前房间（截图口径），人数没读到就不写；
 * - sidebar：Following 侧栏里在竞品库的账号各一行，不在库的丢掉，同一账号只留第一条。
 */
export function buildReadings(input: {
  library: Map<string, CompetitorRef>
  current: { competitorId: string; viewerText: string | null; viewerSource: ViewerSource | null }
  coLive: CoLiveEntry[]
  capturedAtIso: string
  shotId: string
  userId: string
}): ReadingRow[] {
  const base = { captured_at: input.capturedAtIso, shot_id: input.shotId, created_by: input.userId }
  const rows: ReadingRow[] = []
  if (input.current.viewerText) {
    rows.push({
      ...base,
      competitor_id: input.current.competitorId,
      viewer_count: parseCount(input.current.viewerText),
      viewer_text: input.current.viewerText,
      source: 'current',
      viewer_source: input.current.viewerSource,
    })
  }
  const seen = new Set<string>()
  for (const e of input.coLive) {
    const ref = input.library.get(e.handle)
    if (!ref || seen.has(ref.id)) continue
    seen.add(ref.id)
    rows.push({
      ...base,
      competitor_id: ref.id,
      viewer_count: parseCount(e.viewer),
      viewer_text: e.viewer,
      source: 'sidebar',
      viewer_source: null,
    })
  }
  return rows
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/quickShot.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
npx tsc --noEmit
git branch --show-current
git add src/lib/competitors/quickShot.ts src/lib/competitors/quickShot.test.ts package.json
git commit -m "feat(quick-shot): 一键上传接口的纯函数（令牌、handle、日期、读数行）"
```

---

### Task 6: 接口业务逻辑 `quickShotService.ts`

> **执行记录（2026-10-09）**：审查后在本节代码基础上加了 `parseViewerText` 限长、`toViewerCount` 整数钳位、`findShot` 重试幂等、`safely` 兜底、今日计数改用服务器当下日期；最终实现以提交 `1b18d6b` 为准，下方代码是初稿。

**Files:**
- Create: `src/lib/competitors/quickShotService.ts`
- Test: `src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`
- Modify: `package.json`（`test` 脚本追加 ` src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`）

- [ ] **Step 1: 写失败测试**

创建 `src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { createQuickShotHandlers, type QuickShotDeps, type ShotRow } from '../../../../lib/competitors/quickShotService.ts'
import type { CompetitorRef, ReadingRow } from '../../../../lib/competitors/quickShot.ts'

// ============================================================
// 覆盖范围：扩展一键上传接口只认 Bearer 令牌（没有后台网页的 Cookie）。
//   1. 无令牌 / 令牌无效 → 401，什么都不碰
//   2. 文件缺失 / 类型不符 → 400，不上传
//   3. handle 不在竞品库 → 404 not_in_library，不上传、不写库
//   4. 正常 → 201：截图行字段（tag/上传人/日本时间日期/人数）+ 读数行 + 今日计数
//   5. 读数写入失败 → 207 readings_failed，截图照样在
//   6. 本机时钟快了 → 用服务器时间
//   7. GET 今日计数
// ============================================================

const SERVER_NOW = Date.UTC(2026, 9, 9, 9, 42) // 日本时间 2026-10-09 18:42
const LIB: CompetitorRef[] = [
  { id: 'c-dear', handle: '1mb.dear', display_name: '1MB DEAR' },
  { id: 'c-uni', handle: 'uni.chuuu', display_name: 'UNi Chuuu' },
]

function makeDeps(over: Partial<QuickShotDeps> = {}) {
  const calls = { uploads: 0, shots: [] as ShotRow[], readings: [] as ReadingRow[][], counts: [] as [string, string][] }
  const deps: QuickShotDeps = {
    verifyToken: async (t) => (t === 'good' ? { id: 'user-1' } : null),
    listCompetitors: async () => LIB,
    validateImage: (f) => (f.type === 'image/webp' ? { ok: true } : { ok: false, error: 'type' }),
    uploadImage: async () => { calls.uploads += 1; return { url: 'https://x.supabase.co/storage/v1/object/public/competitor-shots/a.webp', error: null } },
    insertShot: async (row) => { calls.shots.push(row); return { id: 'shot-1' } },
    insertReadings: async (rows) => { calls.readings.push(rows); return true },
    countTodayUploads: async (userId, shotOn) => { calls.counts.push([userId, shotOn]); return 7 },
    now: () => SERVER_NOW,
    ...over,
  }
  return { deps, calls }
}

function webp(): File {
  return new File([new Uint8Array(10)], 'a.webp', { type: 'image/webp' })
}

function postReq(fields: Record<string, string | File>, token: string | null = 'good'): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  return new Request('http://localhost/api/competitors/quick-shot', { method: 'POST', headers, body: form })
}

const OK_FIELDS = () => ({
  file: webp(),
  handle: '1mb.dear',
  captured_at: String(SERVER_NOW - 60_000),
  viewer_text: '99',
  viewer_source: 'room',
  co_live: JSON.stringify([
    { handle: '1mb.dear', viewer: '103' },
    { handle: 'uni.chuuu', viewer: '64' },
    { handle: 'stranger', viewer: '692' },
  ]),
})

test('无令牌 → 401，不查库不上传', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS(), null))
  assert.equal(r.status, 401)
  assert.equal(calls.uploads, 0)
})

test('令牌无效 → 401', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS(), 'bad'))
  assert.equal(r.status, 401)
  assert.equal(calls.uploads, 0)
})

test('没带文件 → 400 file_required', async () => {
  const { deps } = makeDeps()
  const { file: _f, ...rest } = OK_FIELDS()
  const r = await createQuickShotHandlers(deps).post(postReq(rest))
  assert.equal(r.status, 400)
  assert.deepEqual(r.body, { data: null, error: 'file_required' })
})

test('文件类型不符 → 400 invalid_type，不上传', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), file: new File([new Uint8Array(1)], 'a.svg', { type: 'image/svg+xml' }) }))
  assert.equal(r.status, 400)
  assert.deepEqual(r.body, { data: null, error: 'invalid_type' })
  assert.equal(calls.uploads, 0)
})

test('handle 不在竞品库 → 404 not_in_library，不上传、不写库', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), handle: 'heroangels_' }))
  assert.equal(r.status, 404)
  assert.deepEqual(r.body, { data: null, error: 'not_in_library' })
  assert.equal(calls.uploads, 0)
  assert.equal(calls.shots.length, 0)
})

test('正常上传 → 201，截图行与读数行字段都对', async () => {
  const { deps, calls } = makeDeps()
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 201)
  assert.deepEqual(r.body, { data: { competitor_name: '1MB DEAR', shot_id: 'shot-1', readings: 3, today_uploads: 7 }, error: null })

  const capturedIso = new Date(SERVER_NOW - 60_000).toISOString()
  assert.deepEqual(calls.shots, [{
    competitor_id: 'c-dear',
    image_url: 'https://x.supabase.co/storage/v1/object/public/competitor-shots/a.webp',
    shot_on: '2026-10-09',
    tag: 'live_manual',
    viewer_count: 99,
    captured_at: capturedIso,
    created_by: 'user-1',
  }])
  assert.deepEqual(calls.readings[0].map((x) => [x.competitor_id, x.source, x.viewer_count]), [
    ['c-dear', 'current', 99],
    ['c-dear', 'sidebar', 103],
    ['c-uni', 'sidebar', 64],
  ])
  assert.deepEqual(calls.counts, [['user-1', '2026-10-09']])
})

test('读数写入失败 → 207 readings_failed，截图照样写了', async () => {
  const { deps, calls } = makeDeps({ insertReadings: async () => false })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 207)
  assert.equal((r.body as { error: string }).error, 'readings_failed')
  assert.equal(calls.shots.length, 1)
})

test('当前房间人数没读到 → 截图 viewer_count 为 null，不写 current 行', async () => {
  const { deps, calls } = makeDeps()
  const { viewer_text: _v, viewer_source: _s, ...rest } = OK_FIELDS()
  const r = await createQuickShotHandlers(deps).post(postReq(rest))
  assert.equal(r.status, 201)
  assert.equal(calls.shots[0].viewer_count, null)
  assert.ok(calls.readings[0].every((x) => x.source === 'sidebar'))
})

test('本机时钟快了 10 分钟 → 读数时刻改用服务器时间', async () => {
  const { deps, calls } = makeDeps()
  await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), captured_at: String(SERVER_NOW + 10 * 60_000) }))
  assert.equal(calls.shots[0].captured_at, new Date(SERVER_NOW).toISOString())
})

test('上传到桶失败 → 500 upload_failed，不写库', async () => {
  const { deps, calls } = makeDeps({ uploadImage: async () => ({ url: null, error: 'upload_failed' }) })
  const r = await createQuickShotHandlers(deps).post(postReq(OK_FIELDS()))
  assert.equal(r.status, 500)
  assert.deepEqual(r.body, { data: null, error: 'upload_failed' })
  assert.equal(calls.shots.length, 0)
})

test('GET：返回我今天（日本时间）的上传数', async () => {
  const { deps, calls } = makeDeps()
  const req = new Request('http://localhost/api/competitors/quick-shot', { headers: { authorization: 'Bearer good' } })
  const r = await createQuickShotHandlers(deps).get(req)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { data: { today_uploads: 7 }, error: null })
  assert.deepEqual(calls.counts, [['user-1', '2026-10-09']])
})

test('GET：无令牌 → 401', async () => {
  const { deps } = makeDeps()
  const r = await createQuickShotHandlers(deps).get(new Request('http://localhost/api/competitors/quick-shot'))
  assert.equal(r.status, 401)
})
```

在 `package.json` 的 `test` 脚本末尾追加 ` src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`
Expected: FAIL — `Cannot find module '.../quickShotService.ts'`。

- [ ] **Step 3: 写实现**

创建 `src/lib/competitors/quickShotService.ts`：

```ts
// src/lib/competitors/quickShotService.ts
// /api/competitors/quick-shot 的业务逻辑。照 src/lib/site/upload-service.ts 的模式：
// 不 import 'next/server'，依赖全部注入，route.ts 只负责绑定真实依赖并转成 NextResponse，
// 本文件由 node --test 直接跑。
// 鉴权只认 Authorization: Bearer —— 调用方是浏览器扩展，没有后台网页的 Cookie。
import { parseCount } from './metrics.ts'
import {
  QUICK_SHOT_TAG, bearerToken, buildReadings, indexByHandle, normalizeHandle, parseCoLive,
  parseViewerSource, resolveCapturedAt, shotOnFor, type CompetitorRef, type ReadingRow,
} from './quickShot.ts'

export const SHOT_BUCKET = 'competitor-shots'

export interface HandlerResult {
  status: number
  body: unknown
}

export interface ShotRow {
  competitor_id: string
  image_url: string
  shot_on: string
  tag: string
  viewer_count: number | null
  captured_at: string
  created_by: string
}

export interface QuickShotDeps {
  verifyToken: (token: string) => Promise<{ id: string } | null>
  /** TikTok 平台的全部竞品（含子级成员）；查询失败返回 null。 */
  listCompetitors: () => Promise<CompetitorRef[] | null>
  validateImage: (file: { type: string; size: number }) => { ok: true } | { ok: false; error: 'type' | 'size' }
  uploadImage: (bucket: string, file: File) => Promise<{ url: string; error: null } | { url: null; error: 'upload_failed' }>
  insertShot: (row: ShotRow) => Promise<{ id: string } | null>
  insertReadings: (rows: ReadingRow[]) => Promise<boolean>
  /** created_by=userId、tag=live_manual、shot_on=当天 的截图数；查询失败返回 null。 */
  countTodayUploads: (userId: string, shotOn: string) => Promise<number | null>
  now: () => number
}

function fail(status: number, error: string): HandlerResult {
  return { status, body: { data: null, error } }
}

async function authenticate(deps: QuickShotDeps, req: Request): Promise<{ id: string } | null> {
  const token = bearerToken(req.headers.get('authorization'))
  return token ? deps.verifyToken(token) : null
}

export function createQuickShotHandlers(deps: QuickShotDeps) {
  async function post(req: Request): Promise<HandlerResult> {
    const user = await authenticate(deps, req)
    if (!user) return fail(401, 'unauthorized')

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return fail(400, 'invalid_form_data')
    }

    const file = form.get('file')
    if (!(file instanceof File)) return fail(400, 'file_required')
    const validated = deps.validateImage(file)
    if (!validated.ok) return fail(400, validated.error === 'type' ? 'invalid_type' : 'file_too_large')

    const handle = normalizeHandle(form.get('handle'))
    if (!handle) return fail(400, 'handle_required')

    const competitors = await deps.listCompetitors()
    if (!competitors) return fail(500, 'db_error')
    const library = indexByHandle(competitors)
    const target = library.get(handle)
    // 不在库就什么都不写——截图要挂在某个竞品名下，没有归属的图不入桶
    if (!target) return fail(404, 'not_in_library')

    const uploaded = await deps.uploadImage(SHOT_BUCKET, file)
    if (uploaded.url === null) return fail(500, 'upload_failed')

    const capturedAt = resolveCapturedAt(form.get('captured_at'), deps.now())
    const capturedAtIso = new Date(capturedAt).toISOString()
    const shotOn = shotOnFor(capturedAt)
    const viewerRaw = form.get('viewer_text')
    const viewerText = typeof viewerRaw === 'string' && viewerRaw.trim() ? viewerRaw.trim() : null

    const shot = await deps.insertShot({
      competitor_id: target.id,
      image_url: uploaded.url,
      shot_on: shotOn,
      tag: QUICK_SHOT_TAG,
      viewer_count: parseCount(viewerText),
      captured_at: capturedAtIso,
      created_by: user.id,
    })
    if (!shot) return fail(500, 'db_error')

    const readings = buildReadings({
      library,
      current: { competitorId: target.id, viewerText, viewerSource: parseViewerSource(form.get('viewer_source')) },
      coLive: parseCoLive(form.get('co_live')),
      capturedAtIso,
      shotId: shot.id,
      userId: user.id,
    })
    const readingsOk = readings.length === 0 || (await deps.insertReadings(readings))
    const todayUploads = await deps.countTodayUploads(user.id, shotOn)

    // 截图已经写进去了：读数失败不能报整体失败（否则人会重传一张重复的），用 207 如实说部分成功
    return {
      status: readingsOk ? 201 : 207,
      body: {
        data: {
          competitor_name: target.display_name ?? target.handle,
          shot_id: shot.id,
          readings: readingsOk ? readings.length : 0,
          today_uploads: todayUploads,
        },
        error: readingsOk ? null : 'readings_failed',
      },
    }
  }

  async function get(req: Request): Promise<HandlerResult> {
    const user = await authenticate(deps, req)
    if (!user) return fail(401, 'unauthorized')
    const todayUploads = await deps.countTodayUploads(user.id, shotOnFor(deps.now()))
    if (todayUploads === null) return fail(500, 'db_error')
    return { status: 200, body: { data: { today_uploads: todayUploads }, error: null } }
  }

  return { post, get }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
npx tsc --noEmit
git branch --show-current
git add src/lib/competitors/quickShotService.ts src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts package.json
git commit -m "feat(quick-shot): 一键上传接口业务逻辑，只认 Bearer 令牌"
```

---

### Task 7: route.ts 绑定真实依赖

**Files:**
- Create: `src/app/api/competitors/quick-shot/route.ts`

- [ ] **Step 1: 写 route**

```ts
// src/app/api/competitors/quick-shot/route.ts
// 浏览器扩展 extensions/live-shot 的一键上传入口。业务判定全在 quickShotService.ts，
// 这里只绑定真实依赖 + 转成 NextResponse。鉴权只认 Bearer 令牌，不走 authGuard（它只读 Cookie）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { uploadImage, validateImage } from '@/lib/storage/upload-image.ts'
import { QUICK_SHOT_TAG } from '@/lib/competitors/quickShot.ts'
import { createQuickShotHandlers, type QuickShotDeps } from '@/lib/competitors/quickShotService.ts'

function deps(): QuickShotDeps {
  const db = createServerClient()
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    verifyToken: async (token) => {
      const { data, error } = await anon.auth.getUser(token)
      return error || !data.user ? null : { id: data.user.id }
    },
    listCompetitors: async () => {
      const { data, error } = await db.from('competitors').select('id, handle, display_name').eq('platform', 'tiktok')
      return error ? null : (data ?? [])
    },
    validateImage,
    uploadImage,
    insertShot: async (row) => {
      const { data, error } = await db.from('competitor_shots').insert(row).select('id').single()
      return error || !data ? null : { id: data.id as string }
    },
    findShot: async (createdBy, competitorId, capturedAtIso) => {
      const { data, error } = await db
        .from('competitor_shots')
        .select('id')
        .eq('created_by', createdBy)
        .eq('competitor_id', competitorId)
        .eq('captured_at', capturedAtIso)
        .limit(1)
        .maybeSingle()
      return error || !data ? null : String((data as { id: string }).id)
    },
    insertReadings: async (rows) => {
      // 重试时同一读数时刻会再来一次：撞唯一约束的行直接跳过，不让整批失败、不报假的 207
      const { error } = await db
        .from('competitor_viewer_readings')
        .upsert(rows, { onConflict: 'competitor_id,captured_at,source', ignoreDuplicates: true })
      return !error
    },
    countTodayUploads: async (userId, shotOn) => {
      const { count, error } = await db
        .from('competitor_shots')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .eq('tag', QUICK_SHOT_TAG)
        .eq('shot_on', shotOn)
      return error ? null : (count ?? 0)
    },
    now: () => Date.now(),
  }
}

export async function POST(req: NextRequest) {
  const r = await createQuickShotHandlers(deps()).post(req)
  return NextResponse.json(r.body, { status: r.status })
}

export async function GET(req: NextRequest) {
  const r = await createQuickShotHandlers(deps()).get(req)
  return NextResponse.json(r.body, { status: r.status })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。若 `data.id` 报类型错，改成 `String((data as { id: string }).id)`，不要用 `any`。

- [ ] **Step 3: 提交**

```bash
git branch --show-current
git add src/app/api/competitors/quick-shot/route.ts
git commit -m "feat(quick-shot): 路由绑定 Supabase 依赖（Bearer 校验 + service role 写库）"
```

---

### Task 8: 数据库迁移文件

**Files:**
- Create: `supabase/migrations/<时间戳>_competitor_quick_shot.sql`

- [ ] **Step 1: 生成文件名**

Run: `TZ=Asia/Tokyo date +%Y%m%d%H%M%S`
用输出拼成 `supabase/migrations/<输出>_competitor_quick_shot.sql`。不要手编时间戳。

- [ ] **Step 2: 写迁移**

```sql
-- 浏览器扩展一键截图上传（extensions/live-shot）：
--   A. competitor_shots 记录上传人，供「今日上传」按人统计；同一上传人、同一竞品、同一读数时刻只留一张（重试/双击去重的数据库兜底）
--   B. 新表 competitor_viewer_readings：每次点击记下当前房间人数 + Following 侧栏同期竞品人数
-- 设计：docs/superpowers/specs/2026-10-09-live-shot-extension-design.md
-- 全部幂等，可重复执行核对。须先于 /api/competitors/quick-shot 上线执行：路由写 created_by、upsert 读数表。
-- 执行方式：SQL Editor 整段执行（隐式单事务）；psql 须带 -1 -v ON_ERROR_STOP=1，否则逐句提交、出错后继续往下跑。

-- 拿不到锁就快速失败、重跑即可，别排在长查询后面把读请求一起堵住
set local lock_timeout = '5s';

-- A. 上传人。外键指向 public.users，与仓库其它表一致（由 auth 用户触发器自动建档），以后做「每人上传量」可直接带出人名
alter table competitor_shots
  add column if not exists created_by uuid references users(id) on delete set null;
create index if not exists idx_competitor_shots_created_by_day
  on competitor_shots(created_by, shot_on)
  where created_by is not null;
-- 重试幂等的兜底：服务先按这三列查重，并发双击时后到的一方撞这条索引（23505）后认领先到的那一行。
-- 部分索引：历史行与自动巡检的 created_by 为 null，不受约束。
create unique index if not exists uq_competitor_shots_uploader_capture
  on competitor_shots(created_by, competitor_id, captured_at)
  where created_by is not null;
comment on column competitor_shots.created_by is '上传人（扩展一键上传写入；历史行与自动巡检为 null）';

-- B. 人数读数
create table if not exists competitor_viewer_readings (
  id            uuid        primary key default gen_random_uuid(),
  competitor_id uuid        not null references competitors(id) on delete cascade,
  captured_at   timestamptz not null,
  viewer_count  integer,
  viewer_text   text,
  source        text        not null,
  viewer_source text,
  shot_id       uuid        references competitor_shots(id) on delete set null,
  created_by    uuid        references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint competitor_viewer_readings_uk unique (competitor_id, captured_at, source),
  constraint competitor_viewer_readings_source_ck check (source in ('current', 'sidebar')),
  -- 三档来源只对当前房间有意义；侧栏行一律为空
  constraint competitor_viewer_readings_viewer_source_ck
    check (viewer_source is null or (source = 'current' and viewer_source in ('room', 'anchored', 'sole')))
);
-- 按竞品查人数历史走唯一约束 (competitor_id, captured_at, source) 的前缀，无需额外索引。
-- 删截图时外键要把 shot_id 置空：没有这条索引就是整表扫描（实测一个竞品挂 8733 条读数时删除 410ms → 45ms）
create index if not exists idx_competitor_viewer_readings_shot
  on competitor_viewer_readings(shot_id)
  where shot_id is not null;
comment on column competitor_viewer_readings.source is 'current=当前房间（截图口径）；sidebar=Following 侧栏同期横截面';
comment on column competitor_viewer_readings.viewer_text is '页面原文，如 1.3K；viewer_count 是解析并钳位到 int4 的值，解析不出为 null';

-- C. RLS：登录用户可读写（沿用 authenticated_only）
do $$
begin
  execute 'alter table competitor_viewer_readings enable row level security';
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'competitor_viewer_readings' and policyname = 'authenticated_only'
  ) then
    execute 'create policy "authenticated_only" on competitor_viewer_readings for all to authenticated using (auth.uid() is not null)';
  end if;
end $$;
```

- [ ] **Step 3: 跑迁移命名检查**

Run: `node scripts/check-migrations.mjs`
Expected: 通过（无报错退出码 0）。

- [ ] **Step 4: 提交（此时只提交文件，不执行）**

```bash
git branch --show-current
git add supabase/migrations/*_competitor_quick_shot.sql
git commit -m "feat(db): 截图记上传人 + 新建在线人数读数表"
```

---

### Task 9: 扩展端纯函数

**Files:**
- Create: `extensions/live-shot/package.json`
- Create: `extensions/live-shot/lib/liveUrl.js`、`crop.js`、`day.js`、`session.js`、`view.js`
- Test: `extensions/live-shot/lib/lib.test.ts`
- Modify: `package.json`（`test` 脚本追加 ` extensions/live-shot/lib/lib.test.ts`）

- [ ] **Step 1: 建 package.json，让 node 把扩展里的 .js 当 ESM**

`extensions/live-shot/package.json`：

```json
{
  "private": true,
  "type": "module"
}
```

- [ ] **Step 2: 写失败测试**

创建 `extensions/live-shot/lib/lib.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { cropRect } from './crop.js'
import { bumpShots, jstDay, shotsToday } from './day.js'
import { handleFromLiveUrl } from './liveUrl.js'
import { needsRefresh, sessionFromAuth } from './session.js'
import { readingState, uploadErrorMessage } from './view.js'

test('handleFromLiveUrl：只认 tiktok.com/@handle/live', () => {
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/@1MB.Dear/live?enter_from_merge=others_homepage'), '1mb.dear')
  assert.equal(handleFromLiveUrl('https://tiktok.com/@uni.chuuu/live/'), 'uni.chuuu')
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/@uni.chuuu'), null, '主页不算')
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/live'), null)
  assert.equal(handleFromLiveUrl('https://evil.example/@a/live'), null)
  assert.equal(handleFromLiveUrl('chrome://extensions'), null)
  assert.equal(handleFromLiveUrl('not a url'), null)
})

test('cropRect：按位图宽/视口宽换算像素，不依赖 devicePixelRatio', () => {
  assert.deepEqual(cropRect({ x: 247, y: 0, width: 506, height: 900 }, 1600, 3200, 1800), { sx: 494, sy: 0, sw: 1012, sh: 1800 })
  assert.deepEqual(cropRect({ x: 10, y: 10, width: 100, height: 100 }, 1000, 1000, 800), { sx: 10, sy: 10, sw: 100, sh: 100 })
})

test('cropRect：越界裁到位图内；空矩形或参数非法返回 null', () => {
  assert.deepEqual(cropRect({ x: -10, y: 700, width: 200, height: 200 }, 1000, 1000, 800), { sx: 0, sy: 700, sw: 190, sh: 100 })
  assert.equal(cropRect({ x: 0, y: 0, width: 1, height: 1 }, 1000, 1000, 800), null)
  assert.equal(cropRect(null, 1000, 1000, 800), null)
  assert.equal(cropRect({ x: 0, y: 0, width: 100, height: 100 }, 0, 1000, 800), null)
})

test('jstDay：日本时间自然日', () => {
  assert.equal(jstDay(Date.UTC(2026, 9, 8, 14, 59)), '2026-10-08')
  assert.equal(jstDay(Date.UTC(2026, 9, 8, 15, 0)), '2026-10-09')
})

test('今日截图计数：同一天累加，跨天归零', () => {
  const d1 = Date.UTC(2026, 9, 9, 3, 0)
  const d2 = Date.UTC(2026, 9, 9, 16, 0) // 日本时间已是 10-10
  assert.equal(shotsToday(null, d1), 0)
  const a = bumpShots(null, d1)
  const b = bumpShots(a, d1)
  assert.deepEqual(b, { day: '2026-10-09', shots: 2 })
  assert.equal(shotsToday(b, d2), 0)
  assert.deepEqual(bumpShots(b, d2), { day: '2026-10-10', shots: 1 })
})

test('sessionFromAuth：取令牌与过期时刻，缺字段返回 null', () => {
  const now = 1_760_000_000_000
  assert.deepEqual(
    sessionFromAuth({ access_token: 'a', refresh_token: 'r', expires_at: 1_760_003_600, user: { email: 'x@y.z' } }, now),
    { accessToken: 'a', refreshToken: 'r', expiresAt: 1_760_003_600_000, email: 'x@y.z' },
  )
  assert.equal(sessionFromAuth({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, now)?.expiresAt, now + 3_600_000)
  assert.equal(sessionFromAuth({ error: 'invalid_grant' }, now), null)
  assert.equal(sessionFromAuth(null, now), null)
})

test('needsRefresh：过期前 60 秒就续', () => {
  const now = 1_000_000
  assert.equal(needsRefresh({ expiresAt: now + 120_000 }, now), false)
  assert.equal(needsRefresh({ expiresAt: now + 30_000 }, now), true)
  assert.equal(needsRefresh(null, now), true)
})

test('readingState：不是直播间 / 没有画面 / 就绪（人数缺失时 viewerOk=false）', () => {
  const ready = { clip: { ready: true, clip: { x: 0, y: 0, width: 10, height: 10 } }, viewer: '99' }
  assert.deepEqual(readingState(null, ready), { kind: 'error', message: '当前页不是直播间' })
  assert.deepEqual(readingState('a', { clip: { ready: false, clip: null }, viewer: null }), { kind: 'error', message: '没找到直播画面' })
  assert.deepEqual(readingState('a', null), { kind: 'error', message: '没找到直播画面' })
  assert.deepEqual(readingState('a', ready), { kind: 'ready', viewerOk: true })
  assert.deepEqual(readingState('a', { ...ready, viewer: null }), { kind: 'ready', viewerOk: false })
})

test('uploadErrorMessage：后台错误码 → 一句话', () => {
  assert.equal(uploadErrorMessage('not_in_library', 'heroangels_'), '@heroangels_ 不在竞品库')
  assert.equal(uploadErrorMessage('unauthorized', 'a'), '登录已过期，请重新登录')
  assert.equal(uploadErrorMessage('file_too_large', 'a'), '截图格式或大小不符')
  assert.equal(uploadErrorMessage('db_error', 'a'), '上传失败，可以重试')
})
```

在根 `package.json` 的 `test` 脚本末尾追加 ` extensions/live-shot/lib/lib.test.ts`。

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/lib.test.ts`
Expected: FAIL — `Cannot find module './crop.js'`。

- [ ] **Step 4: 写实现**

`extensions/live-shot/lib/liveUrl.js`：

```js
// 当前标签页是不是 TikTok 直播间，是的话取出 handle（小写）。
// 只认 tiktok.com/@<handle>/live（带查询串也行）；主页、视频页、发现页都不算。
export function handleFromLiveUrl(href) {
  let u
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !/^(www\.)?tiktok\.com$/.test(u.hostname)) return null
  const m = u.pathname.match(/^\/@([^/]+)\/live\/?$/)
  return m ? decodeURIComponent(m[1]).toLowerCase() : null
}
```

`extensions/live-shot/lib/crop.js`：

```js
// captureVisibleTab 截的是「可见区域」整张位图。像素比 = 位图宽 / 视口 CSS 宽——
// 不直接用 devicePixelRatio：浏览器缩放、换外接屏时两者可能不一致，位图本身才是真的。
// 返回 drawImage 用的源矩形；越界裁到位图内，剩下不足 2px 视为没有画面。
export function cropRect(clip, viewportWidth, bitmapWidth, bitmapHeight) {
  if (!clip || !(viewportWidth > 0) || !(bitmapWidth > 0) || !(bitmapHeight > 0)) return null
  const scale = bitmapWidth / viewportWidth
  const x0 = Math.max(0, Math.round(clip.x * scale))
  const y0 = Math.max(0, Math.round(clip.y * scale))
  const x1 = Math.min(bitmapWidth, Math.round((clip.x + clip.width) * scale))
  const y1 = Math.min(bitmapHeight, Math.round((clip.y + clip.height) * scale))
  if (x1 - x0 < 2 || y1 - y0 < 2) return null
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 }
}
```

`extensions/live-shot/lib/day.js`：

```js
// 「今日」= 日本时间自然日，与截图归档日期 shot_on 同一口径（后台 src/lib/competitors/quickShot.ts 的 shotOnFor）。
export function jstDay(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
}

// 本地截图计数存成 { day, shots }；读到的是别的日子 → 视为 0，跨天自然归零。
export function shotsToday(stored, nowMs) {
  return stored && stored.day === jstDay(nowMs) && Number.isInteger(stored.shots) ? stored.shots : 0
}

export function bumpShots(stored, nowMs) {
  return { day: jstDay(nowMs), shots: shotsToday(stored, nowMs) + 1 }
}
```

`extensions/live-shot/lib/session.js`：

```js
// Supabase 登录 / 续期返回体 → 扩展本地存的会话。密码从不进这里。
export function sessionFromAuth(json, nowMs) {
  if (!json || typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') return null
  const expiresAt = Number.isFinite(json.expires_at)
    ? json.expires_at * 1000
    : nowMs + (Number(json.expires_in) || 3600) * 1000
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    email: json.user && json.user.email ? json.user.email : null,
  }
}

// 提前 60 秒续期，免得请求在路上过期。
export function needsRefresh(session, nowMs) {
  return !session || session.expiresAt - nowMs < 60_000
}
```

`extensions/live-shot/lib/view.js`：

```js
// 弹窗状态判定。所有判断在这里，popup.js 只管渲染。
export function readingState(handle, reading) {
  if (!handle) return { kind: 'error', message: '当前页不是直播间' }
  if (!reading || !reading.clip || !reading.clip.ready || !reading.clip.clip) {
    return { kind: 'error', message: '没找到直播画面' }
  }
  return { kind: 'ready', viewerOk: typeof reading.viewer === 'string' && reading.viewer !== '' }
}

export function uploadErrorMessage(code, handle) {
  switch (code) {
    case 'not_in_library':
      return `@${handle} 不在竞品库`
    case 'unauthorized':
      return '登录已过期，请重新登录'
    case 'invalid_type':
    case 'file_too_large':
      return '截图格式或大小不符'
    default:
      return '上传失败，可以重试'
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/lib.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: 类型检查并提交**

```bash
npx tsc --noEmit
git branch --show-current
git add extensions/live-shot/package.json extensions/live-shot/lib package.json
git commit -m "feat(live-shot): 扩展端纯函数（URL 识别、裁剪换算、今日计数、会话、状态判定）"
```

---

### Task 10: 扩展 API 客户端 `api.js`

**Files:**
- Create: `extensions/live-shot/lib/api.js`
- Test: `extensions/live-shot/lib/api.test.ts`
- Modify: `package.json`（`test` 脚本追加 ` extensions/live-shot/lib/api.test.ts`）

- [ ] **Step 1: 写失败测试**

创建 `extensions/live-shot/lib/api.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { createApi } from './api.js'

const NOW = 1_760_000_000_000

function memoryStorage(init: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...init }
  return {
    data,
    get: async (k: string) => data[k] ?? null,
    set: async (k: string, v: unknown) => { data[k] = v },
    remove: async (k: string) => { delete data[k] },
  }
}

type Call = { url: string; init: RequestInit }
function fakeFetch(routes: Record<string, { status: number; json: unknown }>) {
  const calls: Call[] = []
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const key = Object.keys(routes).find((k) => url.includes(k))
    const r = key ? routes[key] : { status: 404, json: {} }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json }
  }
  return { calls, impl }
}

const CFG = { apiBase: 'https://mcn.example', supabaseUrl: 'https://p.supabase.co', anonKey: 'anon' }
const AUTH_OK = { access_token: 'acc', refresh_token: 'ref', expires_at: NOW / 1000 + 3600 }

test('login：成功存会话、不存密码', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({ 'grant_type=password': { status: 200, json: AUTH_OK } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl as unknown as typeof fetch, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'pw'), true)
  assert.equal((storage.data.session as { accessToken: string }).accessToken, 'acc')
  assert.ok(!JSON.stringify(storage.data).includes('pw'), '密码不落盘')
  assert.equal((f.calls[0].init.headers as Record<string, string>).apikey, 'anon')
})

test('login：失败不存东西', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({ 'grant_type=password': { status: 400, json: { error: 'invalid_grant' } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl as unknown as typeof fetch, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'bad'), false)
  assert.equal(storage.data.session, undefined)
})

test('session：快过期时用 refresh token 续期', async () => {
  const storage = memoryStorage({ session: { accessToken: 'old', refreshToken: 'ref', expiresAt: NOW + 10_000 } })
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 200, json: AUTH_OK } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl as unknown as typeof fetch, now: () => NOW })
  const s = await api.session()
  assert.equal(s?.accessToken, 'acc')
  assert.match(String(f.calls[0].init.body), /"refresh_token":"ref"/)
})

test('session：续期失败清空会话（弹窗回到登录）', async () => {
  const storage = memoryStorage({ session: { accessToken: 'old', refreshToken: 'ref', expiresAt: NOW + 10_000 } })
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 400, json: {} } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl as unknown as typeof fetch, now: () => NOW })
  assert.equal(await api.session(), null)
  assert.equal(storage.data.session, undefined)
})

test('upload：带 Bearer 令牌，表单字段齐全', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const f = fakeFetch({ '/api/competitors/quick-shot': { status: 201, json: { data: { shot_id: 's' }, error: null } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl as unknown as typeof fetch, now: () => NOW })
  const blob = new Blob([new Uint8Array(4)], { type: 'image/webp' })
  const r = await api.upload({
    blob,
    handle: '1mb.dear',
    reading: { capturedAt: NOW, viewer: '99', viewerSource: 'room', coLive: [{ handle: 'uni.chuuu', viewer: '64' }] },
  })
  assert.equal(r.status, 201)
  const call = f.calls[0]
  assert.equal(call.url, 'https://mcn.example/api/competitors/quick-shot')
  assert.equal(call.init.method, 'POST')
  assert.equal((call.init.headers as Record<string, string>).Authorization, 'Bearer acc')
  const form = call.init.body as FormData
  assert.equal(form.get('handle'), '1mb.dear')
  assert.equal(form.get('captured_at'), String(NOW))
  assert.equal(form.get('viewer_text'), '99')
  assert.equal(form.get('viewer_source'), 'room')
  assert.equal(form.get('co_live'), JSON.stringify([{ handle: 'uni.chuuu', viewer: '64' }]))
  assert.equal((form.get('file') as File).type, 'image/webp')
})

test('upload：人数没读到就不带 viewer 字段', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const f = fakeFetch({ '/api/competitors/quick-shot': { status: 201, json: { data: {}, error: null } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl as unknown as typeof fetch, now: () => NOW })
  await api.upload({ blob: new Blob([], { type: 'image/webp' }), handle: 'a', reading: { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null } })
  const form = f.calls[0].init.body as FormData
  assert.equal(form.get('viewer_text'), null)
  assert.equal(form.get('co_live'), '[]')
})

test('没有会话时调用接口 → 直接给 401，不发请求', async () => {
  const f = fakeFetch({})
  const api = createApi({ ...CFG, storage: memoryStorage(), fetchImpl: f.impl as unknown as typeof fetch, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null } })
  assert.equal(r.status, 401)
  assert.equal(f.calls.length, 0)
})

test('todayUploads：200 取数，其它返回 null', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const ok = fakeFetch({ '/api/competitors/quick-shot': { status: 200, json: { data: { today_uploads: 5 }, error: null } } })
  assert.equal(await createApi({ ...CFG, storage, fetchImpl: ok.impl as unknown as typeof fetch, now: () => NOW }).todayUploads(), 5)
  assert.equal(ok.calls[0].init.method, 'GET')
  const bad = fakeFetch({ '/api/competitors/quick-shot': { status: 500, json: {} } })
  assert.equal(await createApi({ ...CFG, storage, fetchImpl: bad.impl as unknown as typeof fetch, now: () => NOW }).todayUploads(), null)
})
```

在根 `package.json` 的 `test` 脚本末尾追加 ` extensions/live-shot/lib/api.test.ts`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/api.test.ts`
Expected: FAIL — `Cannot find module './api.js'`。

- [ ] **Step 3: 写实现**

`extensions/live-shot/lib/api.js`：

```js
// 扩展与后台/Supabase 的全部网络交互。fetch 与存储都可注入，便于 node 测试。
// 会话只存令牌（chrome.storage.local），密码只在 login() 的这一次请求里出现。
import { needsRefresh, sessionFromAuth } from './session.js'

const SESSION_KEY = 'session'
const QUICK_SHOT_PATH = '/api/competitors/quick-shot'

export function createApi({ apiBase, supabaseUrl, anonKey, storage, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  async function authRequest(grant, body) {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    return res.ok ? sessionFromAuth(json, now()) : null
  }

  async function login(email, password) {
    const s = await authRequest('password', { email, password })
    if (s) await storage.set(SESSION_KEY, s)
    return !!s
  }

  async function session() {
    const s = await storage.get(SESSION_KEY)
    if (!s) return null
    if (!needsRefresh(s, now())) return s
    const fresh = await authRequest('refresh_token', { refresh_token: s.refreshToken })
    if (!fresh) {
      await storage.remove(SESSION_KEY)
      return null
    }
    await storage.set(SESSION_KEY, fresh)
    return fresh
  }

  async function logout() {
    await storage.remove(SESSION_KEY)
  }

  async function call(method, body) {
    const s = await session()
    if (!s) return { status: 401, body: { data: null, error: 'unauthorized' } }
    const res = await fetchImpl(`${apiBase}${QUICK_SHOT_PATH}`, {
      method,
      headers: { Authorization: `Bearer ${s.accessToken}` },
      body,
    })
    const json = await res.json().catch(() => ({ data: null, error: 'bad_response' }))
    return { status: res.status, body: json }
  }

  async function todayUploads() {
    const r = await call('GET')
    return r.status === 200 && r.body && r.body.data ? r.body.data.today_uploads : null
  }

  function upload({ blob, handle, reading }) {
    const form = new FormData()
    form.set('file', blob, `${handle}.webp`)
    form.set('handle', handle)
    form.set('captured_at', String(reading.capturedAt))
    if (reading.viewer) form.set('viewer_text', reading.viewer)
    if (reading.viewerSource) form.set('viewer_source', reading.viewerSource)
    form.set('co_live', JSON.stringify(reading.coLive || []))
    return call('POST', form)
  }

  return { login, session, logout, todayUploads, upload }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/api.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
npx tsc --noEmit
git branch --show-current
git add extensions/live-shot/lib/api.js extensions/live-shot/lib/api.test.ts package.json
git commit -m "feat(live-shot): 扩展 API 客户端（登录、续期、上传、今日计数）"
```

---

### Task 11: 扩展外壳、弹窗与配置生成

**Files:**
- Create: `scripts/gen-extension-config.mjs`
- Create: `extensions/live-shot/manifest.json`、`popup.html`、`popup.css`、`popup.js`、`README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 配置生成脚本 + gitignore**

`scripts/gen-extension-config.mjs`：

```js
// 生成 extensions/live-shot/config.local.js（已 gitignore，不进仓库）。
// 只读两个公开值：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY（本来就打包在网页前端里）。
// 运行：node --env-file=<主仓>/.env.local scripts/gen-extension-config.mjs [--api-base http://localhost:3100]
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY：用 --env-file 指向 .env.local 运行')
  process.exit(1)
}
const i = process.argv.indexOf('--api-base')
const apiBase = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'https://mcn.agenova.chat'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extensions', 'live-shot', 'config.local.js')
writeFileSync(
  out,
  [
    '// 自动生成，勿提交（已 gitignore）。重新生成见 extensions/live-shot/README.md',
    `export const API_BASE = ${JSON.stringify(apiBase)}`,
    `export const SUPABASE_URL = ${JSON.stringify(url)}`,
    `export const SUPABASE_ANON_KEY = ${JSON.stringify(key)}`,
    '',
  ].join('\n'),
)
console.log(`✓ ${out}（API_BASE=${apiBase}）`)
```

`.gitignore` 末尾追加一行：

```
extensions/live-shot/config.local.js
```

- [ ] **Step 2: manifest**

`extensions/live-shot/manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "竞品直播截图",
  "version": "0.1.0",
  "description": "在 TikTok 直播间一键截取画面与在线人数，上传到竞品监测后台。",
  "action": {
    "default_popup": "popup.html",
    "default_title": "竞品直播截图"
  },
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": [
    "https://mcn.agenova.chat/*",
    "https://*.supabase.co/*",
    "http://localhost/*"
  ]
}
```

（`activeTab`：只有人点了图标才拿到当前页的临时权限；不声明 tiktok.com，不挂常驻脚本。`http://localhost/*` 匹配任意端口，供本地联调。）

- [ ] **Step 3: popup.html + popup.css**

`extensions/live-shot/popup.html`：

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <form id="login" hidden>
      <p class="title">竞品直播截图</p>
      <label>邮箱<input id="email" type="email" autocomplete="username" required /></label>
      <label>密码<input id="password" type="password" autocomplete="current-password" required /></label>
      <button id="login-btn" class="primary" type="submit">登录</button>
      <p id="login-error" class="error" hidden></p>
      <p class="hint">用 MCN 后台同一个账号。密码不保存在本机。</p>
    </form>
    <section id="main" hidden>
      <div class="row">
        <div id="thumb" class="thumb"></div>
        <div class="info">
          <p id="name" class="name"></p>
          <p id="line1" class="line"></p>
          <p id="line2" class="line"></p>
        </div>
      </div>
      <button id="action" type="button"></button>
      <footer>
        <span>今日</span>
        <span>截图 <b id="count-shots">0</b> · 上传 <b id="count-uploads">—</b></span>
      </footer>
    </section>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

`extensions/live-shot/popup.css`：

```css
:root {
  --bg: #ffffff;
  --text: #1f1e1d;
  --muted: #6b6a66;
  --line: #e5e4df;
  --accent: #2563eb;
  --on-accent: #ffffff;
  --ok: #15803d;
  --warn: #b45309;
  --warn-bg: #fef3c7;
  --thumb-bg: #eff6ff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1f1e1d;
    --text: #f1efe8;
    --muted: #a8a69e;
    --line: #3a3936;
    --accent: #3b82f6;
    --ok: #4ade80;
    --warn: #fbbf24;
    --warn-bg: #3a2f12;
    --thumb-bg: #1e293b;
  }
}
body { width: 260px; margin: 0; padding: 14px 16px 10px; background: var(--bg); color: var(--text); font: 13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
p { margin: 0; }
.title { font-weight: 600; margin-bottom: 10px; }
label { display: block; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
input { display: block; width: 100%; box-sizing: border-box; margin-top: 2px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--text); }
button { width: 100%; margin-top: 12px; padding: 7px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--text); cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
button:disabled { opacity: 0.6; cursor: default; }
.hint { color: var(--muted); font-size: 11px; margin-top: 8px; }
.error { color: var(--warn); font-size: 12px; margin-top: 8px; }
.row { display: flex; gap: 10px; align-items: center; }
.thumb { width: 40px; height: 70px; flex: none; border-radius: 6px; background: var(--thumb-bg) center / cover no-repeat; }
.thumb.warn { background-color: var(--warn-bg); }
.name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { color: var(--muted); }
.line.ok { color: var(--ok); }
.line.warn { color: var(--warn); }
footer { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
footer b { color: var(--text); font-weight: 600; }
```

（扩展在 `src/` 之外，style 检查不扫这里；颜色写在 `:root` 变量里，深色模式一并覆盖。）

- [ ] **Step 4: popup.js**

`extensions/live-shot/popup.js`：

```js
// 弹窗：登录 → 读当前页 + 截图（就绪）→ 上传（已上传 / 出错）。判断逻辑都在 lib/，这里只做编排与渲染。
import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.local.js'
import { PROBE_CONFIG, readLivePage } from './generated/page-reader.js'
import { createApi } from './lib/api.js'
import { cropRect } from './lib/crop.js'
import { bumpShots, shotsToday } from './lib/day.js'
import { handleFromLiveUrl } from './lib/liveUrl.js'
import { readingState, uploadErrorMessage } from './lib/view.js'

// Vercel 函数请求体上限 4.5MB（比后台 validateImage 的 5MB 小），编码目标留余量到 4MB
const MAX_BYTES = 4 * 1024 * 1024
const SHOT_COUNT_KEY = 'shotCount'

const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  remove: (k) => chrome.storage.local.remove(k),
}
const api = createApi({ apiBase: API_BASE, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, storage })
const $ = (id) => document.getElementById(id)

let pending = null // { handle, blob, reading, thumbUrl }
let actionHandler = null

$('action').addEventListener('click', () => actionHandler && actionHandler())

function show(view) {
  $('login').hidden = view !== 'login'
  $('main').hidden = view !== 'main'
}

function render({ name = '', line1 = '', line1Tone = '', line2 = '', line2Tone = '', thumbUrl = null, warn = false, action = null }) {
  $('name').textContent = name
  $('line1').textContent = line1
  $('line1').className = `line ${line1Tone}`
  $('line2').textContent = line2
  $('line2').className = `line ${line2Tone}`
  $('thumb').className = warn ? 'thumb warn' : 'thumb'
  $('thumb').style.backgroundImage = thumbUrl ? `url(${thumbUrl})` : ''
  const btn = $('action')
  btn.hidden = !action
  actionHandler = null
  if (action) {
    btn.textContent = action.label
    btn.className = action.primary ? 'primary' : ''
    btn.disabled = !!action.disabled
    actionHandler = action.disabled ? null : action.run
  }
}

async function renderCounts(uploads) {
  $('count-shots').textContent = String(shotsToday(await storage.get(SHOT_COUNT_KEY), Date.now()))
  if (uploads !== undefined) $('count-uploads').textContent = uploads === null ? '—' : String(uploads)
}

function showLogin(message) {
  show('login')
  $('login-error').hidden = !message
  $('login-error').textContent = message || ''
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('login-btn').disabled = true
  const ok = await api.login($('email').value.trim(), $('password').value).catch(() => false)
  $('password').value = ''
  $('login-btn').disabled = false
  if (!ok) return showLogin('邮箱或密码不对')
  start()
})

async function captureCrop(tab, reading) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const r = cropRect(reading.clip.clip, reading.viewportWidth, bitmap.width, bitmap.height)
  if (!r) return null
  const canvas = new OffscreenCanvas(r.sw, r.sh)
  canvas.getContext('2d').drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh)
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 })
  if (blob.size > MAX_BYTES) blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.75 })
  if (blob.size > MAX_BYTES) blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.6 })
  return blob.size > MAX_BYTES ? null : blob
}

async function prepare() {
  pending = null
  render({ name: '读取中…' })
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const handle = tab && tab.url ? handleFromLiveUrl(tab.url) : null
  let reading = null
  if (handle) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readLivePage, args: [PROBE_CONFIG] })
      reading = res ? res.result : null
    } catch {
      reading = null
    }
  }
  const st = readingState(handle, reading)
  if (st.kind === 'error') {
    return render({ name: handle ? `@${handle}` : '', line1: st.message, warn: true, action: { label: '重试', run: prepare } })
  }
  const blob = await captureCrop(tab, reading).catch(() => null)
  if (!blob) {
    return render({ name: `@${handle}`, line1: '没找到直播画面', warn: true, action: { label: '重试', run: prepare } })
  }
  await storage.set(SHOT_COUNT_KEY, bumpShots(await storage.get(SHOT_COUNT_KEY), Date.now()))
  renderCounts()
  const thumbUrl = URL.createObjectURL(blob)
  pending = { handle, blob, reading, thumbUrl }
  render({
    name: `@${handle}`,
    line1: '✓ 截图',
    line1Tone: 'ok',
    line2: st.viewerOk ? '✓ 人数数据' : '⚠ 人数未读到',
    line2Tone: st.viewerOk ? 'ok' : 'warn',
    thumbUrl,
    action: { label: '上传', primary: true, run: upload },
  })
}

async function upload() {
  if (!pending) return
  const { handle, blob, reading, thumbUrl } = pending
  render({ name: `@${handle}`, line1: '上传中…', thumbUrl, action: { label: '上传中…', disabled: true } })
  const r = await api.upload({ blob, handle, reading }).catch(() => ({ status: 0, body: null }))
  const data = r.body && r.body.data
  if (r.status === 201 || r.status === 207) {
    pending = null
    renderCounts(data.today_uploads)
    return render({
      name: data.competitor_name,
      line1: r.status === 201 ? '已上传' : '截图已上传，人数没写进去',
      line1Tone: r.status === 201 ? 'ok' : 'warn',
      thumbUrl,
      action: { label: '关闭', run: () => window.close() },
    })
  }
  if (r.status === 401) {
    await api.logout()
    return showLogin('登录已过期，请重新登录')
  }
  render({
    name: `@${handle}`,
    line1: uploadErrorMessage(r.body && r.body.error, handle),
    warn: true,
    thumbUrl,
    action: { label: '重试', run: upload },
  })
}

async function start() {
  const session = await api.session().catch(() => null)
  if (!session) return showLogin()
  show('main')
  renderCounts()
  api.todayUploads().then((n) => renderCounts(n)).catch(() => renderCounts(null))
  await prepare()
}

start()
```

- [ ] **Step 5: README**

`extensions/live-shot/README.md`：

````markdown
# 竞品直播截图（Chrome 扩展）

在 TikTok 直播间页面点扩展图标：截下竖屏直播画面、读当前房间与 Following 区同期竞品的在线人数，点「上传」写进竞品监测后台。设计见 `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`。

## 安装

1. 生成本机配置（只含公开值，已 gitignore）：

   ```bash
   node --env-file=/Users/fengzhou/Code/newWith/.env.local scripts/gen-extension-config.mjs
   ```

   本地联调后台时加 `--api-base http://localhost:3100`。

2. Chrome 打开 `chrome://extensions` → 打开右上角「开发者模式」→「加载已解压的扩展程序」→ 选本目录 `extensions/live-shot`。
3. 点工具栏的扩展图标，用 MCN 后台的邮箱和密码登录一次。

## 改了判据之后

`generated/page-reader.js` 由 `src/lib/competitors/pageReader.ts` 生成，禁止手改。改了 `liveProbe.ts` 或 `pageReader.ts` 后运行：

```bash
node --experimental-strip-types scripts/gen-extension-reader.mjs
```

然后在 `chrome://extensions` 里点本扩展的刷新按钮。
````

- [ ] **Step 6: 手动冒烟——扩展能加载、弹窗能渲染**

Run:
```bash
node --env-file=/Users/fengzhou/Code/newWith/.env.local scripts/gen-extension-config.mjs --api-base http://localhost:3100
git status --short extensions/live-shot
```
Expected: 第一条输出 `✓ .../config.local.js（API_BASE=http://localhost:3100）`；第二条**不出现** `config.local.js`（被 gitignore 了）。

请 pollux 在 Chrome 里按 README 第 2 步加载扩展，在任意非 TikTok 页面点图标：应出现登录表单；`chrome://extensions` 里本扩展没有红色「错误」按钮。

- [ ] **Step 7: 提交**

```bash
git branch --show-current
git add .gitignore scripts/gen-extension-config.mjs extensions/live-shot/manifest.json extensions/live-shot/popup.html extensions/live-shot/popup.css extensions/live-shot/popup.js extensions/live-shot/README.md
git commit -m "feat(live-shot): 扩展外壳与弹窗（登录、就绪、已上传、出错、今日计数）"
```

---

### Task 12: 全量检查 + 应用迁移

**Files:** 无新文件

- [ ] **Step 1: 全量检查，逐项确认扩展没被现有检查误伤**

```bash
npm test
npx tsc --noEmit
npm run lint -- --max-warnings=0
node scripts/check-style-tokens.mjs
node scripts/check-migrations.mjs
npx next build
```
Expected: 全部通过。`next build` 输出的路由表里有 `ƒ /api/competitors/quick-shot`（判据看路由表，不看退出码——本仓库遇到过 build 退出码 0 却没产物）。

- [ ] **Step 2: 突变探针（交击杀表）**

先确保工作区干净、上面的改动全部已提交（探针里的 `git checkout` 会冲掉未提交的改动）。对下列每一项：手工改坏 → 跑对应测试 → 记录是否变红 → `git checkout -- <文件>` 还原。

| 突变 | 改法 | 应变红的测试 |
| --- | --- | --- |
| M1 | `quickShot.ts` `resolveCapturedAt` 删掉「快 5 分钟」那行判断 | quickShot.test.ts「本机时钟快了」 |
| M2 | `quickShot.ts` `buildReadings` 去掉 `if (!ref ...) continue` 里的 `!ref \|\|` | quickShot.test.ts「不在库的丢掉」 |
| M3 | `quickShotService.ts` 把 `if (!target) return fail(404...)` 挪到 `uploadImage` 之后 | integration「不上传、不写库」 |
| M4 | `quickShotService.ts` 读数失败时也返回 201 | integration「207 readings_failed」 |
| M5 | `liveProbe.ts` `sidebarRoot` 把 `>= 2` 改成 `>= 1` | liveProbe.test.ts「只有一个频道 → null」 |
| M6 | `liveProbe.ts` `CLIP_FACTORY_SRC` 把 `var mute = ...` 改成 `var mute = true` | liveProbe.test.ts「不动播放器」、pageReader.test.ts「不动播放器」 |
| M7 | `pageReader.ts` 删掉读完后的 `lw.disconnect()` | pageReader.test.ts「observer 已断开」 |
| M8 | `extensions/live-shot/lib/crop.js` 把 `scale` 改成固定 `2` | lib.test.ts「按位图宽/视口宽换算」 |
| M9 | `extensions/live-shot/lib/api.js` `login` 里把密码也存进 storage | api.test.ts「密码不落盘」 |

全部击杀才算通过；有存活的，先补测试再继续。

- [ ] **Step 3: 应用迁移（先问 pollux）**

**先跑两条只读核对**（生产库，只读）：

```sql
-- ① 生产从没跑过本迁移的旧版：应为 null / false。否则 if not exists 会静默跳过、旧对象不会被升级，要另写迁移
select to_regclass('public.competitor_viewer_readings') as readings,
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='competitor_shots' and column_name='created_by') as shots_created_by;
-- ② 每个非匿名登录账号都有 public.users 档案：应为 0。否则该账号上传会撞外键 23503
select count(*) from auth.users a
where not exists (select 1 from public.users u where u.id = a.id)
  and coalesce(a.is_anonymous, false) = false;
```

两条结果不符合预期就停下、报给 pollux。

**向 pollux 明确请求：「迁移只加一列可空字段和一张新表，现在可以在生产库执行吗？」拿到明确的「你来执行」后再跑。** 被 auto 模式拦截时不要换写法绕过，改为把 SQL 文件路径给 pollux，请他在 Supabase Dashboard → SQL Editor 执行。

```bash
set -a; . /Users/fengzhou/Code/newWith/agent-service/.env.local; set +a
/opt/homebrew/opt/postgresql@17/bin/psql "$SUPABASE_DB_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/*_competitor_quick_shot.sql
/opt/homebrew/opt/postgresql@17/bin/psql "$SUPABASE_DB_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/*_competitor_quick_shot.sql
```
Expected: 两次都成功（第二次验证幂等，只有 notice 无 error）。

- [ ] **Step 4: 核对远端 schema 与 RLS**

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$SUPABASE_DB_URL" -c "\d competitor_viewer_readings" -c "select column_name from information_schema.columns where table_name='competitor_shots' and column_name='created_by'"
SUPABASE_DB_URL="$SUPABASE_DB_URL" npm run audit:rls
```
Expected: 表结构与迁移一致；`created_by` 一行；`audit:rls` 不报 `competitor_viewer_readings`。

---

### Task 13: 真机验收（本地后台 + 真实直播间）

**Files:** 无

- [ ] **Step 1: 在 worktree 起本地后台（端口 3100）**

```bash
cp /Users/fengzhou/Code/newWith/.env.local .env.local
npx next dev -p 3100
```
（用 Bash 的 `run_in_background` 跑，别用 `preview_start`——它会跑主仓。`.env.local` 已在根 `.gitignore` 里。）

- [ ] **Step 2: 请 pollux 在已登录 TikTok 的 Chrome 里操作**

1. 确认扩展配置指向本地（Task 11 Step 6 已用 `--api-base http://localhost:3100` 生成），在 `chrome://extensions` 刷新本扩展。
2. 点图标 → 用 MCN 后台账号登录。
3. 打开一个**在播**的竞品直播间，点图标 → 应看到就绪态：缩略图是竖屏画面、两个绿勾、「今日 截图 1 · 上传 N」。
4. 点「上传」→「已上传」，竞品名正确。
5. 打开一个不在竞品库的直播间点图标、点上传 →「@xxx 不在竞品库」。
6. 打开 TikTok 主页点图标 →「当前页不是直播间」。

- [ ] **Step 3: 核对数据库与桶（Claude 执行，只读）**

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$SUPABASE_DB_URL" -c "select s.id, c.handle, s.shot_on, s.tag, s.viewer_count, s.captured_at, s.created_by is not null as has_uploader, s.image_url from competitor_shots s join competitors c on c.id = s.competitor_id where s.tag = 'live_manual' order by s.created_at desc limit 3"
/opt/homebrew/opt/postgresql@17/bin/psql "$SUPABASE_DB_URL" -c "select c.handle, r.source, r.viewer_source, r.viewer_count, r.viewer_text from competitor_viewer_readings r join competitors c on c.id = r.competitor_id order by r.created_at desc limit 20"
```
核对：
- `shot_on` 等于 `TZ=Asia/Tokyo date +%F`；`tag = live_manual`；`has_uploader = t`；`viewer_count` 与弹窗当时右侧面板人数一致。
- 下载 `image_url`，用 Read 工具看图：是竖屏直播画面本身、两侧无深色空白。
- readings：1 行 `current`（来源 `room`）+ Following 区里在竞品库的账号数个 `sidebar` 行；Suggested 区的账号**不出现**。

- [ ] **Step 4: 清理测试数据（先问 pollux）**

问 pollux 验收截图要保留还是删除。要删：用 service role 删 `competitor_shots` 对应行（readings 的 `shot_id` 会被置空，需另删 readings 对应行）并删桶里的对象。

- [ ] **Step 5: 停掉本地后台，删掉 worktree 里的 `.env.local`**

```bash
rm .env.local
```

---

### Task 14: 更新日志 + PR + 上线核对

**Files:**
- Modify: `src/lib/changelog/entries.ts`
- Modify: `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`（如验收中有偏差）

- [ ] **Step 1: 加更新日志条目**

Run: `TZ=Asia/Tokyo date +%F` 取当天日期。若数组顶部已有当天的 `DailyChangelog`，把下面这条追加进它的 `items`；否则在顶部新建 `{ date: '<当天>', items: [...] }`：

```ts
      {
        kind: 'feat',
        scope: '竞品监测',
        title: '新增 Chrome 扩展：在直播间点一下就能截图、记录在线人数并上传',
        details:
          '以前手工上传竞品直播截图，要先用截图工具框出画面，再回后台找到对应账号上传。现在装上「竞品直播截图」扩展后，在 TikTok 直播间点一下工具栏图标，它会自动截下竖屏直播画面，同时读出当前房间的在线人数，以及左侧 Following 区里同一时刻其它在播竞品的在线人数；点「上传」就写进后台，不用离开直播间。\n\n扩展用 MCN 后台的同一个账号登录。弹窗底部显示今天（日本时间）截了几张、上传了几张，上传数按人统计，主 Chrome 和采集用 Chrome 两边看到的是同一个数。不在竞品库的账号会提示先建档，不会写入。\n\n安装方法见仓库 extensions/live-shot/README.md。',
      },
```

- [ ] **Step 2: 提交并推送**

```bash
npx tsc --noEmit
git branch --show-current
git add src/lib/changelog/entries.ts docs/superpowers/specs/2026-10-09-live-shot-extension-design.md
git commit -m "docs(changelog): 竞品直播截图扩展"
git push -u origin feat/live-shot-extension
```

- [ ] **Step 3: 开 PR**

仓库是公开的：PR 描述里不写个人账号、密码、内部人员信息。

```bash
gh pr create --base main --head feat/live-shot-extension --title "feat(live-shot): 直播间一键截图上传 Chrome 扩展" --body "$(cat <<'EOF'
## 做了什么
- 新增 Chrome 扩展 `extensions/live-shot/`：在 TikTok 直播间点图标，截竖屏直播画面 + 读当前房间与 Following 区同期竞品在线人数，登录后一键上传；弹窗显示日本时间当日截图/上传计数。
- 新接口 `/api/competitors/quick-shot`（只认 Bearer 令牌）：POST 上传、GET 今日上传数。
- 迁移：`competitor_shots.created_by` + 新表 `competitor_viewer_readings`（已在生产执行并核对 RLS）。
- 页内读取复用 `liveProbe.ts` 判据，由脚本生成到扩展目录，测试保证同步；`CLIP_FACTORY_SRC` 可选不静音，探针可限定只读 Following 频道（默认行为不变）。

## 设计与计划
- `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`
- `docs/superpowers/plans/2026-10-09-live-shot-extension.md`

## 验证
- `npm test` / `tsc` / lint / style / migrations / `next build` 全过
- 突变探针 M1–M9 全部击杀
- 真机验收：本地后台 + 真实在播直播间，截图、current/sidebar 读数、不在库提示、非直播页提示均符合预期

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

然后按会话约定用 ccd_pr 工具绑定 PR、查看 CI。

- [ ] **Step 4: 合并前问 pollux**

CI 全绿后**询问 pollux 是否合并**，不要自行合并。

- [ ] **Step 5: 上线核对（合并后）**

部署要验证、不能靠 CI 推断：
1. 查 Vercel 生产部署已包含本次提交，且 `mcn.agenova.chat` 指向它。
2. `curl -s -o /dev/null -w '%{http_code}\n' https://mcn.agenova.chat/api/competitors/quick-shot` → 预期 `401`（无令牌），证明路由已上线。
   另请 pollux 在 Supabase Dashboard → Authentication 确认「Allow new user signups」与「Allow anonymous sign-ins」都是关闭的（全仓 RLS 是 auth.uid() is not null，匿名登录也会被放行）：anon key 是公开值，开着的话任何人都能自助注册拿到令牌（这个风险此前就存在，不是本 PR 引入，但扩展把 anon key 又多分发了一份）。
3. 重新生成线上配置并刷新扩展：

```bash
node --env-file=/Users/fengzhou/Code/newWith/.env.local scripts/gen-extension-config.mjs
```

4. 请 pollux 在真实直播间点一次上传，确认「已上传」与今日计数 +1。
