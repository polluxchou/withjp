# 竞品直播截图插件第二版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 插件本地暂存最近 9 张未上传截图并可逐张补传/删除；后台接受 24 小时内的截图时刻、「今日上传」按上传时刻计；侧栏按标题认 Following 并在弹窗里说明没读到的原因。

**Architecture:** 判断逻辑全部下沉为纯函数（`extensions/live-shot/lib/stash.js`、`lib/view.js`、`src/lib/competitors/*.ts`），用 node 测试；IndexedDB 与弹窗 DOM 只做编排，靠真机验收。侧栏判定改在 `liveProbe.ts` 的页内源码字符串里，经 `pageReader.ts` 生成进扩展。

**Tech Stack:** Chrome MV3（纯 JS、ES module、无构建）、IndexedDB、Next.js 路由 + Supabase、`node --test --experimental-strip-types`。

**Spec:** `docs/superpowers/specs/2026-10-11-live-shot-extension-v2-design.md`（第一版：`docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`）

## Global Constraints

- 插件文案中文直写，不走 `messages/*.json`。
- 不新增任何扩展权限；`manifest.json` 版本 `0.2.0`。
- `STASH_MAX = 9`；`STALE_AFTER_MS = 23 小时 50 分`；后台 `MAX_PAST_SKEW_MS = 24 小时`；快 5 分钟的上限不变；超窗口仍改用服务器时间（不拒收）。
- 归档日期与「今日」都按日本时间（`Asia/Tokyo`）；缩略图与确认页上的时刻按本机时区。
- 分钟级采集器行为不变：`defaultProbeConfig()` 不加新字段；未设 `sidebarChannel` 时探针读数里不出现 `co_live_status` 键。
- `PROBE_FACTORY_SRC` / `PAGE_READER_SRC` 是注入页面的源码字符串：内部零 import、零 TS 语法、ES5 写法（`var`、`function`）；它们是模板字符串，正则里的反斜杠要写两遍（`\\s`）。
- 改了 `liveProbe.ts` / `pageReader.ts` 后必须运行 `node --experimental-strip-types scripts/gen-extension-reader.mjs` 并提交 `extensions/live-shot/generated/page-reader.js`。
- 新测试文件登记进 `package.json` 的 `test` 行。
- `src/` 下注释不写 `(#数字)`（style 门禁会当 hex 报错），写成 `PR 123`。
- 仓库公开：代码、注释、文档、提交信息里不写本机路径、人名、账号。
- 每次提交信息末尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 跑单个测试文件：`node --test --experimental-strip-types <文件>`；全量：`npm test`；类型：`npx tsc --noEmit`。

## Review Focus

1. 暂存记录的截图时刻坏了（缺失、字符串、NaN；真机验收第 8 步要在 DevTools 里手改它）→ 当作过期、只能删；缩略图时间显示「—」；弹窗不能因 `Intl` 遇到无效日期抛 `RangeError` 而白屏。→ Task 4 测试。
2. 页内读取报来一个不认识的侧栏状态（新旧版本混用，或恰好是 `toString`、`constructor` 这类原型键）→ 只显示「⚠ 同期没读到」，绝不把函数源码拼进文案。→ Task 5 测试。
3. 频道标题大小写、换行、多余空白不同 → 仍认得；标题只是「含有」following 字样（如「Suggested for following」）→ 不认。→ Task 1 测试。
4. 本机时钟被往回拨，新截的这张比暂存区里所有图都「旧」→ 新截的这张不能被挤掉；同一 id 重复写入不算两张；坏记录最先被挤。→ Task 4 测试。
5. 上传响应残缺（201/207 却没有 `data`、网关返回 HTML 变成 `bad_response`、断网）→ 一律当失败、图留在暂存区、底部计数不动；只有带 `data` 的 201 才移出。→ Task 5 测试。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/lib/competitors/liveProbe.ts` | 页内探针源码：`sidebarRoot` 按标题认 Following、报 `co_live_status` |
| `src/lib/competitors/pageReader.ts` | 扩展的探针配置（加标题选择器与标题清单）、读取函数带出 `coLiveStatus` |
| `extensions/live-shot/generated/page-reader.js` | 生成文件 |
| `src/lib/competitors/quickShot.ts` | 24 小时窗口、`jstDayBounds` |
| `src/lib/competitors/quickShotService.ts` | `countTodayUploads` 改收区间 |
| `src/app/api/competitors/quick-shot/route.ts` | 计数查询改按 `created_at` |
| `extensions/live-shot/lib/stash.js` | 暂存规则纯函数（新） |
| `extensions/live-shot/lib/stashDb.js` | IndexedDB 外壳（新） |
| `extensions/live-shot/lib/view.js` | 加 `coLiveLine`、`uploadOutcome` |
| `extensions/live-shot/popup.{html,css,js}` | 暂存区、确认页、第三行侧栏状态 |
| `extensions/live-shot/{manifest.json,README.md}` | 版本号、说明 |
| `docs/competitors.md`、第一版 spec、`src/lib/changelog/entries.ts` | 文档与更新日志 |

---

### Task 1: 侧栏按标题认 Following，并报侧栏状态

**Files:**
- Modify: `src/lib/competitors/liveProbe.ts`（`ProbeConfig` 类型；`PROBE_FACTORY_SRC` 里的 `sidebarRoot` / `sidebarReading` / `tick`）
- Test: `src/lib/competitors/liveProbe.test.ts`（「只读 Following 频道」那一节）

**Interfaces:**
- Consumes: 无
- Produces:
  - `ProbeConfig.sidebarChannelTitle?: string[]`、`ProbeConfig.followingTitles?: string[]`
  - 设了 `sidebarChannel` 时，`__lw.drain()` 的每条样本多一个键 `co_live_status: 'ok' | 'no_channels' | 'no_following' | 'empty'`；未设时样本里没有这个键。

- [ ] **Step 1: 写失败测试**

在 `liveProbe.test.ts` 里，把现有的 `function coLiveWith(...) { ... }` 整个替换为下面两个函数（`coLiveWith` 签名不变，现有用例照常用）：

```ts
function sampleWith(channels: FakeEl[], over: Record<string, unknown>) {
  const all: Record<string, FakeEl[]> = {
    [CHANNEL]: channels,
    '[data-e2e="live-side-nav-item"]': channels.flatMap((c) => c.querySelectorAll!('[data-e2e="live-side-nav-item"]')),
  }
  const doc = makeDoc({ '.chat': el('') }, all, '/@a/live')
  const win = makeWin()
  factory(win, doc, cfg({ ...VIEWER_CFG, ...over }))
  const lw = (win as Record<string, any>).__lw
  lw.tick()
  return lw.drain()[0]
}
function coLiveWith(channels: FakeEl[], over: Record<string, unknown>) {
  return sampleWith(channels, over).co_live
}
```

在 `test('defaultProbeConfig 不带 sidebarChannel —— 采集器的 cfgKey 不能因此变化', ...)` 之后追加：

```ts
// ---- 按标题认 Following（第二版）-------------------------------------------
// 首日真机：前 10 次上传侧栏只剩 1 个频道，「不足 2 个就当只剩推荐区」把唯一的
// Following 也丢了。改成先按标题认，认不出才退回「≥2 取第一个」。

const TITLE = '[data-e2e="live-side-nav-channel-title"]'
const BY_TITLE = { sidebarChannel: [CHANNEL], sidebarChannelTitle: [TITLE], followingTitles: ['following', 'フォロー中'] }
function titled(title: string, items: FakeEl[]): FakeEl {
  return {
    textContent: title,
    querySelector: (s) => (s === TITLE ? el(title) : null),
    querySelectorAll: (s) => (s === '[data-e2e="live-side-nav-item"]' ? items : []),
  }
}

test('按标题认 Following：只有一个频道、标题是 Following → 照读，不再当成只剩推荐区', () => {
  const s = sampleWith([titled('Following', [navItem('a', '99')])], BY_TITLE)
  assert.deepEqual(s.co_live, [{ handle: 'a', viewer: '99' }])
  assert.equal(s.co_live_status, 'ok')
})

test('按标题认 Following：推荐区排在前面也只读 Following', () => {
  const s = sampleWith([
    titled('Suggested LIVE creators', [navItem('stranger', '692')]),
    titled('Following', [navItem('a', '99')]),
  ], BY_TITLE)
  assert.deepEqual(s.co_live, [{ handle: 'a', viewer: '99' }])
  assert.equal(s.co_live_status, 'ok')
})

test('按标题认 Following：大小写、换行、多余空白不影响；配置里写成大写也认；只是「含有」following 字样不算', () => {
  assert.equal(sampleWith([titled('  FOLLOWING\n ', [navItem('a', '99')])], BY_TITLE).co_live_status, 'ok')
  assert.equal(sampleWith([titled('フォロー中', [navItem('a', '99')])], BY_TITLE).co_live_status, 'ok')
  assert.equal(sampleWith([titled('following', [navItem('a', '99')])], { ...BY_TITLE, followingTitles: ['Following'] }).co_live_status, 'ok')
  const s = sampleWith([titled('Suggested for following', [navItem('stranger', '692')])], BY_TITLE)
  assert.equal(s.co_live, null)
  assert.equal(s.co_live_status, 'no_following')
})

test('按标题认 Following：标题都不认识、频道 ≥2 → 退回读第一个（防 TikTok 改了标题文案）', () => {
  const s = sampleWith([
    titled('Abonnements', [navItem('a', '99')]),
    titled('Suggestions', [navItem('stranger', '692')]),
  ], BY_TITLE)
  assert.deepEqual(s.co_live, [{ handle: 'a', viewer: '99' }])
  assert.equal(s.co_live_status, 'ok')
})

test('按标题认 Following：只有推荐区一个频道 → null + no_following，绝不拿推荐区顶替', () => {
  const s = sampleWith([titled('Suggested LIVE creators', [navItem('stranger', '692')])], BY_TITLE)
  assert.equal(s.co_live, null)
  assert.equal(s.co_live_status, 'no_following')
})

test('侧栏状态：一个频道都没有 → no_channels；Following 在但没有带名字的条目 → empty', () => {
  const none = sampleWith([], BY_TITLE)
  assert.equal(none.co_live, null)
  assert.equal(none.co_live_status, 'no_channels')
  const nameless: FakeEl = { textContent: '5', querySelector: (s) => (s === '[data-e2e="person-count"]' ? el('5') : null) }
  for (const items of [[], [nameless]]) {
    const s = sampleWith([titled('Following', items), titled('Suggested LIVE creators', [navItem('stranger', '692')])], BY_TITLE)
    assert.equal(s.co_live, null)
    assert.equal(s.co_live_status, 'empty')
  }
})

test('侧栏状态：没配标题字段时不按标题认（与第一版一致）——单个 Following 频道仍报 no_following', () => {
  const s = sampleWith([titled('Following', [navItem('a', '99')])], { sidebarChannel: [CHANNEL] })
  assert.equal(s.co_live, null)
  assert.equal(s.co_live_status, 'no_following')
})

test('侧栏状态：第一版两频道用例的状态是 ok', () => {
  const s = sampleWith([channel([navItem('a', '99')]), channel([navItem('stranger', '692')])], { sidebarChannel: [CHANNEL] })
  assert.equal(s.co_live_status, 'ok')
})

test('侧栏状态：不设 sidebarChannel → 读数里没有 co_live_status 这个键（分钟级采集器的样本结构不变）', () => {
  const s = sampleWith([titled('Following', [navItem('a', '99')])], {})
  assert.equal('co_live_status' in s, false)
})

test('defaultProbeConfig 不带按标题认 Following 的两个字段 —— 采集器的 cfgKey 不变', () => {
  const d = defaultProbeConfig()
  assert.equal('sidebarChannelTitle' in d, false)
  assert.equal('followingTitles' in d, false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts`
Expected: 新增用例 FAIL（`co_live_status` 为 `undefined`、单个 Following 频道读出 `null`）；原有用例 PASS。

- [ ] **Step 3: 实现**

`ProbeConfig` 类型里 `sidebarChannel?: string[]` 之后加：

```ts
  /**
   * 频道标题元素的候选选择器。与 followingTitles 一起用：标题命中的频道就是 Following，
   * 不论一共几个、排第几。只在设了 sidebarChannel 时生效；两项缺一就不按标题认。
   */
  sidebarChannelTitle?: string[]
  /** Following 频道的标题。两边都小写、去首尾空白、连续空白压成一个后整串相等才算 */
  followingTitles?: string[]
```

把 `PROBE_FACTORY_SRC` 里从 `/**\n   * 侧栏从哪儿读。` 那段注释开始、到 `function sidebarReading() { ... }` 结束的整块替换为：

```js
  /**
   * 侧栏从哪儿读，返回 { root, status }。不设 sidebarChannel = 整页（分钟级采集器，一条不漏），
   * status 为 null；sidebarChannel 为空数组等同未设。
   * 设了 = 只读 Following：侧栏每个区块是一个频道容器，已登录时有 Following 与 Suggested。
   * 判定顺序（候选选择器按顺序试，第一个有匹配的就定案）：
   *   1. 一个频道都没有 → no_channels
   *   2. 有频道的标题是 Following（见 followingTitles）→ 读它，不论一共几个、排第几
   *   3. 标题都认不出、频道 ≥ 2 → 读第一个（标题文案改了时的兜底）
   *   4. 否则（只剩 1 个且标题不像 Following）→ no_following，绝不拿 Suggested 顶替
   * 首日真机就栽在第 4 步的旧版本上：侧栏只剩 Following 一个频道时，「不足 2 个就当只剩
   * 推荐区」把它也丢了，所以先按标题认。
   */
  function normTitle(s) {
    return String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase()
  }
  function channelTitle(ch) {
    var sels = cfg.sidebarChannelTitle || []
    for (var i = 0; i < sels.length; i++) {
      var t = textOf(ch && ch.querySelector && ch.querySelector(sels[i]))
      if (t) return normTitle(t)
    }
    return ''
  }
  function isFollowing(ch) {
    var t = channelTitle(ch)
    if (!t) return false
    var titles = cfg.followingTitles || []
    for (var i = 0; i < titles.length; i++) {
      if (normTitle(titles[i]) === t) return true
    }
    return false
  }
  function sidebarRoot() {
    if (!cfg.sidebarChannel || !cfg.sidebarChannel.length) return { root: doc, status: null }
    var byTitle = !!(cfg.sidebarChannelTitle && cfg.sidebarChannelTitle.length && cfg.followingTitles && cfg.followingTitles.length)
    for (var k = 0; k < cfg.sidebarChannel.length; k++) {
      var chans = doc.querySelectorAll(cfg.sidebarChannel[k]) || []
      if (!chans.length) continue
      if (byTitle) {
        for (var c = 0; c < chans.length; c++) {
          if (isFollowing(chans[c])) return { root: chans[c], status: 'ok' }
        }
      }
      return chans.length >= 2 ? { root: chans[0], status: 'ok' } : { root: null, status: 'no_following' }
    }
    return { root: null, status: 'no_channels' }
  }
  /**
   * 顺手把左侧「已关注」侧栏整条抄下来 —— 那是**同一时刻**其它在播直播间的在线人数。
   *
   * 本来是当噪音要丢掉的（它正是 viewer 读错号的根源），但换个角度看：待在 A 房间
   * 的每一分钟，侧栏都白送一份 B/C/D/E 的同期横截面，零额外请求、零额外暴露面。
   * 单个房间的曲线只能说"它涨了"，配上同期别家的数就能说"是它涨了还是大盘涨了"。
   *
   * 只记 handle 与人数原文，不做解析也不做过滤（谁在竞品库里是入库时的事，
   * 这里多记几个非竞品账号的成本是零，漏记了却补不回来）。
   * 返回 { list, status }：list 没有就是 null；status 只在设了 sidebarChannel 时有值，
   * 找到了频道却一条带名字的都没有 → empty。
   */
  function sidebarReading() {
    var limited = !!(cfg.sidebarChannel && cfg.sidebarChannel.length)
    if (!doc.querySelectorAll) return { list: null, status: limited ? 'no_channels' : null }
    var r = sidebarRoot()
    if (!r.root || !r.root.querySelectorAll) return { list: null, status: r.status }
    var out = []
    for (var a = 0; a < cfg.viewerItem.length && !out.length; a++) {
      var items = r.root.querySelectorAll(cfg.viewerItem[a]) || []
      for (var i = 0; i < items.length; i++) {
        var nm = null
        for (var b = 0; b < cfg.viewerName.length && !nm; b++) {
          nm = textOf(items[i].querySelector && items[i].querySelector(cfg.viewerName[b])) || null
        }
        var pc = null
        for (var c = 0; c < cfg.viewer.length && !pc; c++) {
          pc = textOf(items[i].querySelector && items[i].querySelector(cfg.viewer[c])) || null
        }
        if (nm) out.push({ handle: nm, viewer: pc })
      }
    }
    return { list: out.length ? out : null, status: r.status === null ? null : (out.length ? 'ok' : 'empty') }
  }
```

把 `tick()` 里的 `st.buf.push({ ... })` 改成先组样本、再按需加键：

```js
  function tick() {
    var v = viewerReading()
    var side = sidebarReading()
    var f = firstText(cfg.followers)
    var l = firstText(cfg.likes)
    var sample = {
      t: win.Date.now(),
      viewer: v.text,
      viewer_source: v.source,
      // 同期其它在播房间的人数（来自左侧「已关注」侧栏），没有就是 null
      co_live: side.list,
      followers: f.text,
      likes: l.text,
      // 弹幕容器选择器没命中过就报 null，别把 0 当成"房间很安静"——跟下面 speakers 同一个道理
      msgs: st.hostSel ? st.msgs : null,
      // 没有可靠的发言人选择器就报 null，别把 0 当成「没人说话」
      speakers: st.speakerSel ? st.nSpeakers : null,
      observerAlive: alive(),
      selectorsOk: {
        viewer: v.source, followers: f.sel, likes: l.sel,
        chatHost: st.hostSel, speaker: st.speakerSel
      }
    }
    // 侧栏状态只给限定了频道的调用方（扩展）；分钟级采集器的样本结构一个键都不多
    if (side.status !== null) sample.co_live_status = side.status
    st.buf.push(sample)
```

（`st.buf.push(...)` 之后的 `st.msgs = 0` 等几行保持不动。）

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/liveProbe.test.ts`
Expected: 全部 PASS。再跑 `node --test --experimental-strip-types src/lib/competitors/liveTrack.test.ts`，Expected: 全部 PASS（采集器侧不受影响）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/competitors/liveProbe.ts src/lib/competitors/liveProbe.test.ts
git commit -m "feat(live-probe): 侧栏按标题认 Following，并报侧栏状态码

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 扩展读取配置加标题判据，读取结果带出侧栏状态

**Files:**
- Modify: `src/lib/competitors/pageReader.ts`
- Modify（生成）: `extensions/live-shot/generated/page-reader.js`
- Test: `src/lib/competitors/pageReader.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ProbeConfig.sidebarChannelTitle` / `followingTitles`、样本里的 `co_live_status`
- Produces:
  - `export const SIDEBAR_CHANNEL_TITLE: string[]`、`export const FOLLOWING_TITLES: string[]`
  - `readLivePage(cfg)` 的返回值多一个字段 `coLiveStatus: 'ok' | 'no_channels' | 'no_following' | 'empty' | null`

- [ ] **Step 1: 写失败测试**

`pageReader.test.ts` 顶部 import 改为：

```ts
import { FOLLOWING_TITLES, PAGE_READER_SRC, SIDEBAR_CHANNEL, SIDEBAR_CHANNEL_TITLE, extensionProbeConfig, renderReaderModule } from './pageReader.ts'
```

把 `function channel(items) { ... }` 替换为带标题的版本：

```ts
const CHANNEL_TITLE = '[data-e2e="live-side-nav-channel-title"]'
function channel(title: string, items: FakeNode[]): FakeNode {
  return {
    textContent: title,
    querySelector: (s) => (s === CHANNEL_TITLE ? el(title) : null),
    querySelectorAll: (s) => (s === '[data-e2e="live-side-nav-item"]' ? items : []),
  }
}
```

把 `function makePage() {` 改为可传频道，并让默认频道带上真实标题：

```ts
function makePage(channels?: FakeNode[]) {
  const video = { muted: false, volume: 1, videoWidth: 540, videoHeight: 960, readyState: 4, getBoundingClientRect: () => ({ x: 100, y: 0, width: 800, height: 900 }) }
  const roomKids = [el(''), el('Viewers· 99')]
  const room: FakeNode = { textContent: 'Viewers· 99', querySelectorAll: (s) => (s === 'div' ? roomKids : []) }
  const chans = channels ?? [
    channel('Following', [navItem('1mb.dear', '103'), navItem('uni.chuuu', '64')]),
    channel('Suggested LIVE creators', [navItem('stranger', '692')]),
  ]
  const map: Record<string, unknown> = { video, [CHAT_BOX]: room }
  const all: Record<string, FakeNode[]> = {
    '[data-e2e="live-side-nav-channel"]': chans,
    '[data-e2e="live-side-nav-item"]': chans.flatMap((c) => c.querySelectorAll!('[data-e2e="live-side-nav-item"]')),
  }
```

（`makePage` 其余部分——`doc`、`observers`、`win`、`return`——保持不动。）

在第一个用例 `test('读一次：画面矩形、房间面板人数、只含 Following 的同期横截面', ...)` 的末尾（`assert.deepEqual(r.coLive, ...)` 之后）加一行：

```ts
  assert.equal(r.coLiveStatus, 'ok')
```

把 `test('extensionProbeConfig：在默认配置上只改 intervalMs / chatHost / sidebarChannel', ...)` 与 `test('extensionProbeConfig：sidebarChannel 是副本，改它不影响常量', ...)` 两个用例整体替换为：

```ts
test('extensionProbeConfig：在默认配置上只改 intervalMs / chatHost / 侧栏三项', () => {
  const c = extensionProbeConfig()
  assert.equal(c.intervalMs, 0)
  assert.deepEqual(c.chatHost, [])
  assert.deepEqual(c.sidebarChannel, SIDEBAR_CHANNEL)
  assert.deepEqual(c.sidebarChannelTitle, SIDEBAR_CHANNEL_TITLE)
  assert.deepEqual(c.followingTitles, FOLLOWING_TITLES)
  const { intervalMs: _i, chatHost: _c, sidebarChannel: _s, sidebarChannelTitle: _t, followingTitles: _f, ...rest } = c
  const { intervalMs: _di, chatHost: _dc, ...defaults } = defaultProbeConfig()
  assert.deepEqual(rest, defaults)
})

test('extensionProbeConfig：侧栏三项都是副本，改它们不影响常量', () => {
  const before = [[...SIDEBAR_CHANNEL], [...SIDEBAR_CHANNEL_TITLE], [...FOLLOWING_TITLES]]
  const c = extensionProbeConfig()
  c.sidebarChannel!.push('x')
  c.sidebarChannelTitle!.push('x')
  c.followingTitles!.push('x')
  assert.deepEqual([SIDEBAR_CHANNEL, SIDEBAR_CHANNEL_TITLE, FOLLOWING_TITLES], before)
  const again = extensionProbeConfig()
  assert.deepEqual([again.sidebarChannel, again.sidebarChannelTitle, again.followingTitles], before)
})

test('FOLLOWING_TITLES：都已是规范形（小写、无首尾空白），英中日三种界面都在', () => {
  for (const t of FOLLOWING_TITLES) assert.equal(t, t.trim().toLowerCase())
  for (const t of ['following', '关注', 'フォロー中']) assert.ok(FOLLOWING_TITLES.includes(t), t)
})

test('读一次：侧栏只剩 Following 一个频道也照读', () => {
  const { win, doc } = makePage([channel('Following', [navItem('1mb.dear', '103')])])
  const r = reader(win, doc, extensionProbeConfig())
  assert.deepEqual(r.coLive, [{ handle: '1mb.dear', viewer: '103' }])
  assert.equal(r.coLiveStatus, 'ok')
})

test('读一次：只有推荐区 → coLive 为 null、coLiveStatus 说明原因', () => {
  const { win, doc } = makePage([channel('Suggested LIVE creators', [navItem('stranger', '692')])])
  const r = reader(win, doc, extensionProbeConfig())
  assert.equal(r.coLive, null)
  assert.equal(r.coLiveStatus, 'no_following')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/pageReader.test.ts`
Expected: FAIL（`SIDEBAR_CHANNEL_TITLE` / `FOLLOWING_TITLES` 未导出、`coLiveStatus` 为 `undefined`）。

- [ ] **Step 3: 实现**

`pageReader.ts` 里 `SIDEBAR_CHANNEL` 之后加两个常量，并改 `extensionProbeConfig`：

```ts
/** 侧栏频道标题。2026-10-09 / 10-10 已登录实测：Following 与 Suggested LIVE creators 两个频道都有它。 */
export const SIDEBAR_CHANNEL_TITLE = ['[data-e2e="live-side-nav-channel-title"]']

/**
 * Following 频道的标题（已是规范形：小写、无首尾空白）。界面语言不同标题不同；
 * 标题规范化后整串相等才算，见 liveProbe.ts 的 sidebarRoot。
 */
export const FOLLOWING_TITLES = ['following', '关注', '已关注', '正在关注', '追蹤中', 'フォロー中', 'フォロー']

/**
 * 扩展用的探针配置：不起定时器（手动 tick 一次），同期横截面只读 Following（先按标题认）。
 * 一次性读取用不着弹幕计数，chatHost 置空就不挂 MutationObserver。
 * 数组都返回副本，调用方改不到常量。
 */
export function extensionProbeConfig(): ProbeConfig {
  return {
    ...defaultProbeConfig(),
    intervalMs: 0,
    chatHost: [],
    sidebarChannel: [...SIDEBAR_CHANNEL],
    sidebarChannelTitle: [...SIDEBAR_CHANNEL_TITLE],
    followingTitles: [...FOLLOWING_TITLES],
  }
}
```

（删掉原来那段 `extensionProbeConfig` 及其注释。）

`PAGE_READER_SRC` 返回对象里 `coLive: sample ? sample.co_live : null` 之后加一项（注意上一行末尾补逗号）：

```js
    coLive: sample ? sample.co_live : null,
    // 侧栏读没读到、为什么没读到（liveProbe 的 co_live_status）；弹窗据此提示
    coLiveStatus: sample && sample.co_live_status ? sample.co_live_status : null
```

- [ ] **Step 4: 重新生成扩展读取文件**

Run: `node --experimental-strip-types scripts/gen-extension-reader.mjs`
Expected: 输出 `✓ …/extensions/live-shot/generated/page-reader.js`；`git diff --stat` 显示该文件有改动，`PROBE_CONFIG` 里出现 `sidebarChannelTitle` 与 `followingTitles`。

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/pageReader.test.ts src/lib/competitors/liveProbe.test.ts`
Expected: 全部 PASS（含「已提交的 generated/page-reader.js 与源码一致」与 vm 注入模拟）。

- [ ] **Step 6: 提交**

```bash
git add src/lib/competitors/pageReader.ts src/lib/competitors/pageReader.test.ts extensions/live-shot/generated/page-reader.js
git commit -m "feat(live-shot): 扩展读取按标题认 Following，并带出侧栏状态

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 后台——截图时刻窗口放宽到 24 小时，「今日上传」按上传时刻计

**Files:**
- Modify: `src/lib/competitors/quickShot.ts`（`MAX_PAST_SKEW_MS`、`resolveCapturedAt` 注释、新增 `jstDayBounds`）
- Modify: `src/lib/competitors/quickShotService.ts`（`QuickShotDeps.countTodayUploads` 签名、POST/GET 调用）
- Modify: `src/app/api/competitors/quick-shot/route.ts`（`countTodayUploads` 查询）
- Modify: `docs/competitors.md`（「今日上传」口径）
- Test: `src/lib/competitors/quickShot.test.ts`、`src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export function jstDayBounds(ms: number): { startIso: string; endIso: string }`
  - `QuickShotDeps.countTodayUploads: (userId: string, day: { startIso: string; endIso: string }) => Promise<number | null>`
  - 接口返回体不变：`today_uploads` 仍是数字或 null，只是口径变为「上传时刻落在日本时间今天」。

- [ ] **Step 1: 写失败测试（纯函数）**

`quickShot.test.ts`：import 里加 `jstDayBounds`：

```ts
import {
  bearerToken, buildReadings, indexByHandle, jstDayBounds, normalizeHandle, parseCoLive,
  parseViewerSource, parseViewerText, resolveCapturedAt, shotOnFor, toViewerCount, type CompetitorRef,
} from './quickShot.ts'
```

把 `test('resolveCapturedAt：太久以前（秒/毫秒单位搞混、1970 年）也回落到服务器时间，只认 1 小时内', ...)` 整个替换为：

```ts
test('resolveCapturedAt：太久以前（秒/毫秒单位搞混、1970 年）也回落到服务器时间，只认 24 小时内', () => {
  const server = 1_760_000_000_000
  const DAY = 24 * 60 * 60_000
  assert.equal(resolveCapturedAt(String(Math.floor(server / 1000)), server), server, '客户端传了秒而不是毫秒')
  assert.equal(resolveCapturedAt('1', server), server)
  assert.equal(resolveCapturedAt('0.4', server), server, '四舍五入后为 0')
  assert.equal(resolveCapturedAt(String(server - 2 * 60 * 60_000), server), server - 2 * 60 * 60_000, '插件暂存 2 小时后补传，仍是真实截图时刻')
  assert.equal(resolveCapturedAt(String(server - (23 * 60 + 59) * 60_000), server), server - (23 * 60 + 59) * 60_000, '23 小时 59 分前')
  assert.equal(resolveCapturedAt(String(server - DAY), server), server - DAY, '恰好 24 小时仍认')
  assert.equal(resolveCapturedAt(String(server - DAY - 1), server), server, '超过 24 小时 → 服务器时间')
  assert.equal(resolveCapturedAt(String(server - 25 * 60 * 60_000), server), server, '25 小时前')
})
```

在 `test('shotOnFor：...')` 之后追加：

```ts
test('jstDayBounds：日本时间自然日的 [00:00, 次日 00:00)，UTC 跨日也对', () => {
  const oct10 = { startIso: '2026-10-09T15:00:00.000Z', endIso: '2026-10-10T15:00:00.000Z' }
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 9, 15, 30)), oct10, '日本 10-10 00:30（UTC 还是 10-09）')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 10, 3, 0)), oct10, '日本 10-10 12:00')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 10, 14, 59, 59, 999)), oct10, '日本 10-10 23:59:59.999')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 10, 15, 0)), { startIso: '2026-10-10T15:00:00.000Z', endIso: '2026-10-11T15:00:00.000Z' }, '恰好日本零点属于新的一天')
  assert.deepEqual(jstDayBounds(Date.UTC(2026, 9, 9, 14, 59, 59, 999)), { startIso: '2026-10-08T15:00:00.000Z', endIso: '2026-10-09T15:00:00.000Z' })
})

test('jstDayBounds：与 shotOnFor 同一口径——起点的日本日期就是 shotOnFor(ms)', () => {
  for (const ms of [Date.UTC(2026, 0, 1, 0, 0), Date.UTC(2026, 11, 31, 14, 59), Date.UTC(2026, 11, 31, 15, 0), Date.UTC(2026, 9, 10, 3, 0)]) {
    const { startIso } = jstDayBounds(ms)
    assert.equal(shotOnFor(Date.parse(startIso)), shotOnFor(ms))
  }
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types src/lib/competitors/quickShot.test.ts`
Expected: FAIL（`jstDayBounds` 未导出；2 小时前那条断言失败）。

- [ ] **Step 3: 实现纯函数**

`quickShot.ts`：

```ts
const MAX_PAST_SKEW_MS = 24 * 60 * 60 * 1000
```

`resolveCapturedAt` 上方的注释改为：

```ts
/**
 * 读数时刻用客户端传的。插件会在本地暂存还没上传的截图，隔几个小时再补传是正常的，
 * 所以「过去」最多认 24 小时（插件那边满 23 小时 50 分就置灰不让传）；比服务器快 5 分钟以上、
 * 或早于 24 小时都视为时钟/单位异常（例如传了秒而不是毫秒），异常或非法就改用服务器时间。
 */
```

在 `shotOnFor` 之后加：

```ts
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * ms 所在日本时间自然日的起止时刻 [00:00, 次日 00:00)，用于「今日上传」按上传时刻计数。
 * 日本没有夏令时，一天恒为 24 小时，直接按 +09:00 偏移算。
 */
export function jstDayBounds(ms: number): { startIso: string; endIso: string } {
  const start = Math.floor((ms + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS
  return { startIso: new Date(start).toISOString(), endIso: new Date(start + DAY_MS).toISOString() }
}
```

- [ ] **Step 4: 跑纯函数测试确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/quickShot.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 写失败测试（接口层）**

`quick-shot-api.integration.test.ts`：

1. 文件头覆盖范围第 7 条改为：
```ts
//   7. 日期口径：shot_on 取读数时刻的日本时间日期；今日计数按上传时刻，取服务器当下所在的日本时间自然日
```
并在第 10 条之后加：
```ts
//  11. 插件暂存后补传：24 小时内用原截图时刻（shot_on 是截图那天），超过就改用服务器时间
```

2. `SERVER_NOW` 定义之后加：
```ts
// 服务器当下（日本 2026-10-10）所在自然日的上传时刻区间
const TODAY_JST = { startIso: '2026-10-09T15:00:00.000Z', endIso: '2026-10-10T15:00:00.000Z' }
```

3. `makeDeps` 里：
```ts
    counts: [] as [string, { startIso: string; endIso: string }][],
```
```ts
    countTodayUploads: async (userId, day) => { calls.counts.push([userId, day]); return 7 },
```

4. 把文件里三处 `assert.deepEqual(calls.counts, [['user-1', '2026-10-10']])` 全部改为 `assert.deepEqual(calls.counts, [['user-1', TODAY_JST]])`；把用例名 `'跨日本时间午夜：shot_on 取读数时刻（10-09），今日计数取服务器当下（10-10）'` 改为 `'跨日本时间午夜：shot_on 取读数时刻（10-09），今日计数按服务器当下（10-10）的上传时刻区间'`。

5. 在该跨午夜用例之后追加：
```ts
test('插件暂存后隔天补传：20 小时前截的图用原截图时刻，shot_on 是截图那天，今日计数是今天的区间', async () => {
  const serverNow = Date.UTC(2026, 9, 10, 3, 0) // 日本时间 2026-10-10 12:00
  const capturedAt = serverNow - 20 * 60 * 60_000 // 日本时间 2026-10-09 16:00
  const { deps, calls } = makeDeps({ now: () => serverNow })
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), captured_at: String(capturedAt) }))
  assert.equal(r.status, 201)
  assert.equal(calls.shots[0].captured_at, new Date(capturedAt).toISOString())
  assert.equal(calls.shots[0].shot_on, '2026-10-09')
  assert.deepEqual(calls.finds, [['user-1', 'c-dear', new Date(capturedAt).toISOString()]], '重试去重认的是原截图时刻')
  assert.deepEqual(calls.counts, [['user-1', TODAY_JST]])
})

test('截图时刻早于 24 小时 → 改用服务器时间（插件那边早该置灰，这里兜底）', async () => {
  const serverNow = Date.UTC(2026, 9, 10, 3, 0)
  const { deps, calls } = makeDeps({ now: () => serverNow })
  const r = await createQuickShotHandlers(deps).post(postReq({ ...OK_FIELDS(), captured_at: String(serverNow - 25 * 60 * 60_000) }))
  assert.equal(r.status, 201)
  assert.equal(calls.shots[0].captured_at, new Date(serverNow).toISOString())
  assert.equal(calls.shots[0].shot_on, '2026-10-10')
})
```

- [ ] **Step 6: 跑接口测试确认失败**

Run: `node --test --experimental-strip-types src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts`
Expected: FAIL（计数依赖收到的还是日期字符串 `'2026-10-10'`）。

- [ ] **Step 7: 实现服务层与路由**

`quickShotService.ts`：import 里加 `jstDayBounds`（`shotOnFor` 仍要用）。`QuickShotDeps` 里 `countTodayUploads` 的注释与签名改为：

```ts
  /**
   * created_by=userId、tag=live_manual、上传时刻 created_at 落在 [startIso, endIso) 的截图数；查询失败返回 null。
   * 按上传时刻算「今天」：补传昨天截的图，今天也算一张（归档日期 shot_on 仍是截图那天）。
   */
  countTodayUploads: (userId: string, day: { startIso: string; endIso: string }) => Promise<number | null>
```

POST 里那两行改为：

```ts
    // 「今天」与 GET 同一口径：服务器当下所在的日本时间自然日，按上传时刻（created_at）计
    const todayUploads = await safely(() => deps.countTodayUploads(user.id, jstDayBounds(deps.now())), null)
```

GET 里改为：

```ts
    const todayUploads = await deps.countTodayUploads(user.id, jstDayBounds(deps.now()))
```

`route.ts` 的 `countTodayUploads` 改为：

```ts
    countTodayUploads: async (userId, day) => {
      const { count, error } = await db
        .from('competitor_shots')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .eq('tag', QUICK_SHOT_TAG)
        .gte('created_at', day.startIso)
        .lt('created_at', day.endIso)
      return error ? null : (count ?? 0)
    },
```

- [ ] **Step 8: 跑测试与类型检查确认通过**

Run: `node --test --experimental-strip-types src/lib/competitors/quickShot.test.ts src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts && npx tsc --noEmit`
Expected: 全部 PASS，tsc 无输出。

- [ ] **Step 9: 更新文档**

`docs/competitors.md`：
- `quickShotService.ts` 那一行的「今日上传数」改为「今日上传数（按上传时刻的日本时间自然日）」；
- 接口表 `/api/competitors/quick-shot` 那一行的「GET 返回本人今天（日本时间）的上传数」改为「GET 返回本人今天（日本时间，按上传时刻）的上传数」。

- [ ] **Step 10: 提交**

```bash
git add src/lib/competitors/quickShot.ts src/lib/competitors/quickShot.test.ts src/lib/competitors/quickShotService.ts src/app/api/competitors/quick-shot/route.ts src/app/api/competitors/quick-shot/quick-shot-api.integration.test.ts docs/competitors.md
git commit -m "feat(quick-shot): 截图时刻窗口放宽到 24 小时，今日上传按上传时刻计

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 暂存规则纯函数

**Files:**
- Create: `extensions/live-shot/lib/stash.js`
- Create: `extensions/live-shot/lib/stash.test.ts`
- Modify: `package.json`（`test` 行登记新测试文件）

**Interfaces:**
- Consumes: 无
- Produces（暂存记录形如 `{ id, handle, blob, reading: { capturedAt, viewer, viewerSource, coLive, coLiveStatus }, partial }`）：
  - `export const STASH_MAX = 9`
  - `export const STALE_AFTER_MS`（23 小时 50 分，毫秒）
  - `export function planInsert(items, incoming)` → 要挤掉的记录数组（最旧在前）
  - `export function isStale(item, nowMs)` → boolean
  - `export function stripOrder(items)` → 新数组，新的在前
  - `export function tileTime(capturedAt, nowMs, timeZone?)` → `'14:05'` / `'昨 09:02'` / `'10-08 09:02'` / `'—'`
  - `export function stampTime(capturedAt, timeZone?)` → `'10-10 13:41'` / `'—'`
  - `export function evictionNotice(evicted, nowMs, timeZone?)` → 提示文字或 `''`

- [ ] **Step 1: 写失败测试**

`extensions/live-shot/lib/stash.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { STALE_AFTER_MS, STASH_MAX, evictionNotice, isStale, planInsert, stampTime, stripOrder, tileTime } from './stash.js'

const TZ = 'Asia/Tokyo'
const NOW = Date.UTC(2026, 9, 10, 3, 0) // 日本时间 2026-10-10 12:00
const MIN = 60_000
const shot = (id: string, capturedAt: unknown, handle = '1mb.dear') => ({ id, handle, reading: { capturedAt }, partial: false })
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

test('planInsert：未满不挤', () => {
  const items = Array.from({ length: STASH_MAX - 1 }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(planInsert(items, shot('new', NOW + MIN)), [])
})

test('planInsert：满 9 张再来一张 → 挤掉最旧的那一张', () => {
  const items = Array.from({ length: STASH_MAX }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(ids(planInsert(items, shot('new', NOW + MIN))), ['s8'])
})

test('planInsert：已经超了（两个窗口各写了一张之类）→ 一次挤到只剩 9 张，最旧的在前', () => {
  const items = Array.from({ length: STASH_MAX + 2 }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(ids(planInsert(items, shot('new', NOW + MIN))), ['s10', 's9', 's8'])
})

test('planInsert：本机时钟被往回拨、新截的反而最「旧」→ 新截的这张不挤，挤别的里最旧的', () => {
  const items = Array.from({ length: STASH_MAX }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(ids(planInsert(items, shot('new', NOW - 60 * MIN))), ['s8'])
})

test('planInsert：同一时刻按 id 定序，输入顺序不影响结果', () => {
  const items = ['c', 'a', 'i', 'b', 'h', 'd', 'g', 'e', 'f'].map((id) => shot(id, NOW))
  assert.deepEqual(ids(planInsert(items, shot('z', NOW))), ['a'])
  assert.deepEqual(ids(planInsert([...items].reverse(), shot('z', NOW))), ['a'])
})

test('planInsert：同一 id 重复写入不算两张', () => {
  const items = Array.from({ length: STASH_MAX }, (_, i) => shot(`s${i}`, NOW - i * MIN))
  assert.deepEqual(planInsert(items, shot('s0', NOW)), [])
})

test('planInsert：截图时刻坏了的记录最先被挤', () => {
  const items = [...Array.from({ length: STASH_MAX - 1 }, (_, i) => shot(`s${i}`, NOW - i * MIN)), shot('bad', 'x')]
  assert.deepEqual(ids(planInsert(items, shot('new', NOW + MIN))), ['bad'])
})

test('isStale：满 23 小时 50 分才置灰（比后台的 24 小时提前 10 分钟）', () => {
  assert.equal(STALE_AFTER_MS, (23 * 60 + 50) * MIN)
  assert.equal(isStale(shot('a', NOW - STALE_AFTER_MS + 1000), NOW), false)
  assert.equal(isStale(shot('a', NOW - STALE_AFTER_MS), NOW), true)
  assert.equal(isStale(shot('a', NOW + 5 * MIN), NOW), false, '截图时刻在未来（本机时钟被往回拨）不算过期')
})

test('isStale：截图时刻坏了（缺失 / 字符串 / NaN / 连 reading 都没有）→ 当作过期，只能删', () => {
  assert.equal(isStale(shot('a', undefined), NOW), true)
  assert.equal(isStale(shot('a', String(NOW)), NOW), true)
  assert.equal(isStale(shot('a', Number.NaN), NOW), true)
  assert.equal(isStale({ id: 'a', handle: 'a' }, NOW), true)
})

test('stripOrder：新的在前，不改原数组', () => {
  const items = [shot('old', NOW - 2 * MIN), shot('new', NOW), shot('mid', NOW - MIN)]
  assert.deepEqual(ids(stripOrder(items)), ['new', 'mid', 'old'])
  assert.deepEqual(ids(items), ['old', 'new', 'mid'])
})

test('tileTime：同一天给时:分，前一天加「昨」，其它给月-日（按传入时区）', () => {
  assert.equal(tileTime(Date.UTC(2026, 9, 10, 0, 5), NOW, TZ), '09:05')
  assert.equal(tileTime(Date.UTC(2026, 9, 9, 15, 0), NOW, TZ), '00:00')
  assert.equal(tileTime(Date.UTC(2026, 9, 9, 14, 59), NOW, TZ), '昨 23:59')
  assert.equal(tileTime(Date.UTC(2026, 9, 8, 3, 0), NOW, TZ), '10-08 12:00')
  assert.equal(tileTime(NOW + 26 * 60 * MIN, NOW, TZ), '10-11 14:00', '在未来也不说「今天」')
})

test('tileTime：时区决定「同一天」——同一时刻在东京是今天、在上海是昨天', () => {
  const t = Date.UTC(2026, 9, 9, 15, 30) // 东京 10-10 00:30，上海 10-09 23:30
  assert.equal(tileTime(t, NOW, TZ), '00:30')
  assert.equal(tileTime(t, NOW, 'Asia/Shanghai'), '昨 23:30')
})

test('tileTime / stampTime：时刻坏了给「—」，不抛错（Intl 遇到无效日期会抛 RangeError）', () => {
  assert.equal(tileTime(Number.NaN, NOW, TZ), '—')
  assert.equal(tileTime(undefined, NOW, TZ), '—')
  assert.equal(tileTime('1760000000000', NOW, TZ), '—')
  assert.equal(stampTime(Number.NaN, TZ), '—')
  assert.equal(stampTime(undefined, TZ), '—')
})

test('stampTime：月-日 时:分', () => {
  assert.equal(stampTime(Date.UTC(2026, 9, 10, 4, 41), TZ), '10-10 13:41')
})

test('evictionNotice：没挤是空串；一张写账号和时间；多张写张数和最早那张', () => {
  assert.equal(evictionNotice([], NOW, TZ), '')
  assert.equal(evictionNotice([shot('x', Date.UTC(2026, 9, 10, 1, 2))], NOW, TZ), '最早 1 张未上传的已被挤掉（@1mb.dear 10:02）')
  assert.equal(
    evictionNotice([shot('y', Date.UTC(2026, 9, 10, 1, 5), 'uni.chuuu'), shot('x', Date.UTC(2026, 9, 9, 14, 0), '1mb.rizz')], NOW, TZ),
    '最早 2 张未上传的已被挤掉（最早一张 @1mb.rizz 昨 23:00）',
  )
})
```

`package.json` 的 `test` 行里，在 `extensions/live-shot/lib/api.test.ts` 之后插入 ` extensions/live-shot/lib/stash.test.ts`（一个空格分隔）。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/stash.test.ts`
Expected: FAIL（`Cannot find module './stash.js'`）。

- [ ] **Step 3: 实现**

`extensions/live-shot/lib/stash.js`：

```js
// 本地暂存区的规则：上限、挤掉谁、何时过期、缩略图下的时间文字。纯函数，node 测试。
// 存取在 stashDb.js（IndexedDB），这里不碰任何浏览器 API。
// 一条暂存记录：{ id, handle, blob, reading: { capturedAt, viewer, viewerSource, coLive, coLiveStatus }, partial }

export const STASH_MAX = 9
// 后台只认 24 小时内的截图时刻，超了会悄悄改用服务器时间、归错日期。
// 提前 10 分钟置灰，留给上传耗时和本机时钟偏慢。
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000 - 10 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

function capturedAtOf(item) {
  const c = item && item.reading ? item.reading.capturedAt : undefined
  return typeof c === 'number' && Number.isFinite(c) ? c : null
}

// 从旧到新；截图时刻坏了的当作最旧（最先被挤）；同一时刻按 id 定序，结果确定
function byAge(a, b) {
  const ka = capturedAtOf(a) ?? -Infinity
  const kb = capturedAtOf(b) ?? -Infinity
  if (ka !== kb) return ka < kb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// 写入 incoming 之后超出上限的部分，最旧的在前。incoming 本身永远不挤（哪怕本机时钟被往回拨、它看着最旧）；
// 与 incoming 同 id 的旧记录会被覆盖，不算两张
export function planInsert(items, incoming) {
  const others = items.filter((it) => it.id !== incoming.id).sort(byAge)
  const over = others.length + 1 - STASH_MAX
  return over > 0 ? others.slice(0, over) : []
}

// 截图时刻坏了的一律当过期：传上去后台也只会改用服务器时间，只能删
export function isStale(item, nowMs) {
  const c = capturedAtOf(item)
  return c === null || nowMs - c >= STALE_AFTER_MS
}

export function stripOrder(items) {
  return [...items].sort(byAge).reverse()
}

function parts(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const o = {}
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value
  return { day: `${o.year}-${o.month}-${o.day}`, md: `${o.month}-${o.day}`, hm: `${o.hour}:${o.minute}` }
}

const validMs = (ms) => typeof ms === 'number' && Number.isFinite(ms)

// 缩略图下的时间：与 nowMs 同一天「14:05」，前一天「昨 09:02」，其它「10-08 09:02」。
// timeZone 缺省为本机时区；时刻坏了给「—」——Intl 遇到无效日期会抛 RangeError，不能让整个弹窗白屏
export function tileTime(capturedAt, nowMs, timeZone) {
  if (!validMs(capturedAt)) return '—'
  const c = parts(capturedAt, timeZone)
  if (c.day === parts(nowMs, timeZone).day) return c.hm
  if (c.day === parts(nowMs - DAY_MS, timeZone).day) return `昨 ${c.hm}`
  return `${c.md} ${c.hm}`
}

// 确认页上的完整时刻「10-10 13:41」
export function stampTime(capturedAt, timeZone) {
  if (!validMs(capturedAt)) return '—'
  const c = parts(capturedAt, timeZone)
  return `${c.md} ${c.hm}`
}

// 满了挤掉旧图时的一行提示；没挤给空串
export function evictionNotice(evicted, nowMs, timeZone) {
  if (!evicted.length) return ''
  const oldest = [...evicted].sort(byAge)[0]
  const when = tileTime(capturedAtOf(oldest), nowMs, timeZone)
  return evicted.length === 1
    ? `最早 1 张未上传的已被挤掉（@${oldest.handle} ${when}）`
    : `最早 ${evicted.length} 张未上传的已被挤掉（最早一张 @${oldest.handle} ${when}）`
}
```

- [ ] **Step 4: 跑测试与类型检查确认通过**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/stash.test.ts && npx tsc --noEmit`
Expected: 全部 PASS，tsc 无输出。再跑 `npm test`，Expected: 全量通过且输出里能看到 stash 的用例（确认登记生效）。

- [ ] **Step 5: 提交**

```bash
git add extensions/live-shot/lib/stash.js extensions/live-shot/lib/stash.test.ts package.json
git commit -m "feat(live-shot): 本地暂存区规则（上限 9 张、挤最旧、23 小时 50 分过期、时间文字）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 弹窗判定纯函数——侧栏状态文案、上传结果归类

**Files:**
- Modify: `extensions/live-shot/lib/view.js`
- Test: `extensions/live-shot/lib/lib.test.ts`

**Interfaces:**
- Consumes: 现有 `uploadErrorMessage(code, handle)`
- Produces:
  - `export function coLiveLine(status, coLive)` → `{ text: string, tone: 'ok' | 'warn' }`
  - `export function uploadOutcome(r, handle)` → 下列之一：
    - `{ kind: 'ok', stash: 'remove', name: string, todayUploads: number | null }`
    - `{ kind: 'partial', stash: 'partial', name: string, todayUploads: number | null }`
    - `{ kind: 'login', stash: 'keep' }`
    - `{ kind: 'error', stash: 'keep', message: string }`
    （只有 ok / partial 带 `todayUploads` 键；`r` 是 `api.upload` 的返回 `{ status, body }`，也可能是 `null`）

- [ ] **Step 1: 写失败测试**

`lib.test.ts` 的 import 改为：

```ts
import { coLiveLine, readingState, uploadErrorMessage, uploadOutcome } from './view.js'
```

文件末尾追加：

```ts
test('coLiveLine：读到了写条数（含当前房间与不在库的，入库时再过滤），没读到按原因说', () => {
  assert.deepEqual(coLiveLine('ok', [{ handle: 'a', viewer: '1' }, { handle: 'b', viewer: null }]), { text: '✓ 同期 2 个', tone: 'ok' })
  assert.deepEqual(coLiveLine('no_following', null), { text: '⚠ 同期没读到：侧栏只有推荐区（TikTok 没登录，或关注的人都没在播）', tone: 'warn' })
  assert.deepEqual(coLiveLine('no_channels', null), { text: '⚠ 同期没读到：没找到侧栏（页面结构可能变了）', tone: 'warn' })
  assert.deepEqual(coLiveLine('empty', null), { text: '⚠ 同期没读到：Following 区是空的', tone: 'warn' })
})

test('coLiveLine：状态缺失 / 不认识 / 恰好是原型上的键 / ok 却没条目 → 只说「没读到」', () => {
  for (const s of [null, undefined, 'weird', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.deepEqual(coLiveLine(s, null), { text: '⚠ 同期没读到', tone: 'warn' }, String(s))
  }
  assert.deepEqual(coLiveLine('ok', []), { text: '⚠ 同期没读到', tone: 'warn' })
  assert.deepEqual(coLiveLine('ok', null), { text: '⚠ 同期没读到', tone: 'warn' })
})

test('uploadOutcome：201 带 data → 传完、移出暂存区，带回竞品名与今日上传数', () => {
  assert.deepEqual(
    uploadOutcome({ status: 201, body: { data: { competitor_name: '1MB DEAR', today_uploads: 3 }, error: null } }, '1mb.dear'),
    { kind: 'ok', stash: 'remove', name: '1MB DEAR', todayUploads: 3 },
  )
})

test('uploadOutcome：207 → 截图已入库、人数没写进去：留在暂存区并打「人数待补」', () => {
  assert.deepEqual(
    uploadOutcome({ status: 207, body: { data: { competitor_name: '1MB DEAR', today_uploads: 3 }, error: 'readings_failed' } }, '1mb.dear'),
    { kind: 'partial', stash: 'partial', name: '1MB DEAR', todayUploads: 3 },
  )
})

test('uploadOutcome：竞品名缺失回落到 @handle，今日数不是数字给 null', () => {
  assert.deepEqual(
    uploadOutcome({ status: 201, body: { data: { competitor_name: '', today_uploads: null } } }, 'uni.chuuu'),
    { kind: 'ok', stash: 'remove', name: '@uni.chuuu', todayUploads: null },
  )
})

test('uploadOutcome：401 → 回登录，图留着', () => {
  assert.deepEqual(uploadOutcome({ status: 401, body: { data: null, error: 'unauthorized' } }, 'a'), { kind: 'login', stash: 'keep' })
})

test('uploadOutcome：响应残缺（201/207 却没有 data、data 不是对象、网关 HTML、断网、5xx、null）一律当失败，图留着、计数不动', () => {
  for (const r of [
    { status: 201, body: { data: null, error: 'bad_response' } },
    { status: 207, body: { data: null, error: 'readings_failed' } },
    { status: 201, body: { data: 'x', error: null } },
    { status: 201, body: { data: [], error: null } },
    { status: 0, body: { data: null, error: 'network_error' } },
    { status: 500, body: { data: null, error: 'db_error' } },
    null,
  ]) {
    const out = uploadOutcome(r, '1mb.dear')
    assert.equal(out.kind, 'error', JSON.stringify(r))
    assert.equal(out.stash, 'keep')
    assert.equal('todayUploads' in out, false, '失败时不能动底部计数')
  }
  assert.equal(uploadOutcome({ status: 0, body: { data: null, error: 'network_error' } }, 'a').message, '网络不通，可以重试')
  assert.equal(uploadOutcome({ status: 404, body: { data: null, error: 'not_in_library' } }, '1mb.dear').message, '@1mb.dear 不在竞品库')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/lib.test.ts`
Expected: FAIL（`coLiveLine` / `uploadOutcome` 未导出）。

- [ ] **Step 3: 实现**

`view.js` 末尾追加：

```js
// 侧栏同期人数那一行（顶部卡片第三行、放大确认页共用）。只是提示，不拦上传。
// status 是页内读取报的 co_live_status；不认识的值（新旧版本混用等）一律按「没读到」说。
// 用 switch 而不是对象查表：查表遇到 'toString' 这类原型键会把函数拼进文案。
export function coLiveLine(status, coLive) {
  const n = Array.isArray(coLive) ? coLive.length : 0
  if (status === 'ok' && n > 0) return { text: `✓ 同期 ${n} 个`, tone: 'ok' }
  switch (status) {
    case 'no_following':
      return { text: '⚠ 同期没读到：侧栏只有推荐区（TikTok 没登录，或关注的人都没在播）', tone: 'warn' }
    case 'no_channels':
      return { text: '⚠ 同期没读到：没找到侧栏（页面结构可能变了）', tone: 'warn' }
    case 'empty':
      return { text: '⚠ 同期没读到：Following 区是空的', tone: 'warn' }
    default:
      return { text: '⚠ 同期没读到', tone: 'warn' }
  }
}

// 上传响应 → 弹窗怎么显示、暂存区怎么处理。
// 只有带 data 的 201 才算传完、移出暂存区；207 = 截图已入库、人数没写进去，留着并标「人数待补」
// （再传一次后台按截图时刻认出同一张，只补写人数）；其它一律当失败，图留着、底部计数不动。
export function uploadOutcome(r, handle) {
  const status = r ? r.status : 0
  const body = r && r.body && typeof r.body === 'object' ? r.body : null
  const data = body && body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : null
  if ((status === 201 || status === 207) && data) {
    const name = typeof data.competitor_name === 'string' && data.competitor_name ? data.competitor_name : `@${handle}`
    const todayUploads = typeof data.today_uploads === 'number' ? data.today_uploads : null
    return status === 201
      ? { kind: 'ok', stash: 'remove', name, todayUploads }
      : { kind: 'partial', stash: 'partial', name, todayUploads }
  }
  if (status === 401) return { kind: 'login', stash: 'keep' }
  return { kind: 'error', stash: 'keep', message: uploadErrorMessage(body && body.error, handle) }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test --experimental-strip-types extensions/live-shot/lib/lib.test.ts && npx tsc --noEmit`
Expected: 全部 PASS，tsc 无输出。

- [ ] **Step 5: 提交**

```bash
git add extensions/live-shot/lib/view.js extensions/live-shot/lib/lib.test.ts
git commit -m "feat(live-shot): 侧栏状态文案与上传结果归类下沉为纯函数

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: IndexedDB 外壳 + 弹窗（暂存区、放大确认页、第三行侧栏状态）

**Files:**
- Create: `extensions/live-shot/lib/stashDb.js`
- Modify: `extensions/live-shot/popup.html`、`popup.css`、`popup.js`
- Modify: `extensions/live-shot/manifest.json`（`"version": "0.2.0"`）
- Modify: `extensions/live-shot/README.md`

**Interfaces:**
- Consumes: Task 2 的 `readLivePage` 返回值 `coLiveStatus`；Task 4 的 `evictionNotice` / `isStale` / `planInsert` / `stampTime` / `stripOrder` / `tileTime`；Task 5 的 `coLiveLine` / `uploadOutcome`；现有 `api.upload({ blob, handle, reading })`、`readingState`、`cropRect`、`bumpShots` / `shotsToday`、`handleFromLiveUrl`
- Produces（`stashDb.js`）：
  - `listStash(): Promise<Record[]>`
  - `insertStash(item): Promise<Record[]>`（返回被挤掉的记录）
  - `markPartial(id): Promise<void>`、`removeStash(id): Promise<void>`

这一任务没有 node 测试（node 没有 IndexedDB 与 DOM）；判断都已在 Task 4/5 下沉。验证靠语法检查 + Task 7 的真机验收。

- [ ] **Step 1: 写 `lib/stashDb.js`**

```js
// 本地暂存区的 IndexedDB 外壳：只做读写，规则全在 stash.js。
// node 没有 IndexedDB，这一层靠真机验收（见第二版设计第 8 节）。
// 全部用回调式请求：事务在没有挂起请求时会自动提交，不能在中间夹 await。
import { planInsert } from './stash.js'

const DB_NAME = 'live-shot'
const STORE = 'stash'

let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('indexedDB open blocked'))
    }).catch((e) => {
      dbPromise = null // 下次再试，别把一次失败缓存成永久失败
      throw e
    })
  }
  return dbPromise
}

// 在一个事务里跑 body(store, out)，事务提交后才 resolve(out.value)
function run(mode, body) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const out = { value: undefined }
        t.oncomplete = () => resolve(out.value)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error || new Error('stash transaction aborted'))
        body(t.objectStore(STORE), out)
      }),
  )
}

export function listStash() {
  return run('readonly', (store, out) => {
    const r = store.getAll()
    r.onsuccess = () => { out.value = r.result }
  })
}

// 写入新记录并挤掉超出上限的旧记录，同一个 readwrite 事务：两个窗口同时截图时事务排队，不会多出或删错。
// 返回被挤掉的记录。
export function insertStash(item) {
  return run('readwrite', (store, out) => {
    const r = store.getAll()
    r.onsuccess = () => {
      const evicted = planInsert(r.result, item)
      store.put(item)
      for (const e of evicted) store.delete(e.id)
      out.value = evicted
    }
  })
}

export function markPartial(id) {
  return run('readwrite', (store) => {
    const r = store.get(id)
    r.onsuccess = () => {
      if (r.result) store.put({ ...r.result, partial: true })
    }
  })
}

export function removeStash(id) {
  return run('readwrite', (store) => {
    store.delete(id)
  })
}
```

- [ ] **Step 2: 改 `popup.html`**

整个文件替换为：

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
          <p id="line3" class="line"></p>
        </div>
      </div>
      <button id="action" type="button"></button>
      <p id="notice" class="notice" hidden></p>
      <div id="stash" hidden>
        <p class="stash-title">未上传 <b id="stash-count">0</b> 张</p>
        <div id="strip" class="strip"></div>
      </div>
      <footer>
        <span>今日</span>
        <span>截图 <b id="count-shots">0</b> · 上传 <b id="count-uploads">—</b><button id="logout" type="button" class="link">退出</button></span>
      </footer>
    </section>
    <section id="detail" hidden>
      <div id="detail-img" class="big"></div>
      <p id="detail-name" class="name"></p>
      <p id="detail-viewer" class="line"></p>
      <p id="detail-colive" class="line"></p>
      <p id="detail-status" class="line" hidden></p>
      <button id="detail-upload" class="primary" type="button">上传</button>
      <div class="btns">
        <button id="detail-delete" type="button">删掉</button>
        <button id="detail-back" type="button">返回</button>
      </div>
    </section>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 3: 改 `popup.css`**

文件末尾追加（宽度、配色变量都沿用现有的）：

```css
.notice { color: var(--muted); font-size: 11px; margin-top: 6px; }
.stash-title { color: var(--muted); font-size: 12px; margin: 12px 0 6px; }
.stash-title b { color: var(--text); font-weight: 600; }
/* 横排缩略图，放不下就横向滚动 */
.strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
/* 缩略图是按钮：覆盖通用 button 的整行宽度/边框/上边距，焦点环仍沿用 button:focus-visible */
button.tile { flex: none; width: 48px; margin: 0; padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
.tile-img { position: relative; display: block; width: 44px; height: 78px; border: 2px solid transparent; border-radius: 6px; background: var(--thumb-bg) center / cover no-repeat; }
.tile.current .tile-img { border-color: var(--accent); }
.tile.partial .tile-img::after { content: ''; position: absolute; top: 3px; right: 3px; width: 7px; height: 7px; border-radius: 50%; background: var(--warn); }
.tile-time, .tile-handle { display: block; font-size: 11px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile-time { color: var(--text); }
.tile-handle { color: var(--muted); }
.tile.stale .tile-img { filter: grayscale(1); opacity: 0.45; }
.tile.stale .tile-time { color: var(--muted); }
/* 放大确认页 */
.big { width: 130px; height: 231px; margin: 0 auto 8px; border-radius: 6px; background: var(--thumb-bg) center / contain no-repeat; }
.big.stale { filter: grayscale(1); opacity: 0.5; }
.btns { display: flex; gap: 8px; }
.btns button { margin-top: 8px; }
```

- [ ] **Step 4: 改 `popup.js`**

整个文件替换为：

```js
// 弹窗：登录 → 读当前页 + 截图（存进本地暂存区）→ 上传；下方暂存区可逐张放大确认后补传或删掉。
// 判断逻辑都在 lib/，这里只做编排与渲染。
import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.local.js'
import { PROBE_CONFIG, readLivePage } from './generated/page-reader.js'
import { createApi } from './lib/api.js'
import { cropRect } from './lib/crop.js'
import { bumpShots, shotsToday } from './lib/day.js'
import { handleFromLiveUrl } from './lib/liveUrl.js'
import { evictionNotice, isStale, stampTime, stripOrder, tileTime } from './lib/stash.js'
import { insertStash, listStash, markPartial, removeStash } from './lib/stashDb.js'
import { coLiveLine, readingState, uploadOutcome } from './lib/view.js'

// Vercel 函数请求体上限 4.5MB（比后台 validateImage 的 5MB 小），编码目标留余量到 4MB
const MAX_BYTES = 4 * 1024 * 1024
const SHOT_COUNT_KEY = 'shotCount'
const BACK_AFTER_UPLOAD_MS = 1500
const DELETE_CONFIRM_MS = 3000

const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  remove: (k) => chrome.storage.local.remove(k),
}
const api = createApi({ apiBase: API_BASE, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, storage })
const $ = (id) => document.getElementById(id)

// 顶部这张：{ item, state, name, message }
//   state：ready 就绪 / uploading 上传中 / uploaded 已上传 / partial 人数待补 / error 出错 / deleted 已在确认页删掉
//   item 已写进暂存区；暂存失败时只在内存里，照样能传
let current = null
let stashItems = [] // 暂存区全部记录（来自 IndexedDB）
const thumbUrls = new Map() // 记录 id → object URL
let actionHandler = null
let uploadedThisOpen = false // 已有上传响应里的新计数时，初始 GET 迟到的旧数不能盖掉它
let detailId = null
let deleteTimer = null
let backTimer = null

$('action').addEventListener('click', () => actionHandler && actionHandler())

function show(view) {
  $('login').hidden = view !== 'login'
  $('main').hidden = view !== 'main'
  $('detail').hidden = view !== 'detail'
}

function render({ name = '', line1 = '', line1Tone = '', line2 = '', line2Tone = '', line3 = '', line3Tone = '', thumbUrl = null, warn = false, action = null }) {
  $('name').textContent = name
  $('line1').textContent = line1
  $('line1').className = `line ${line1Tone}`
  $('line2').textContent = line2
  $('line2').className = `line ${line2Tone}`
  $('line3').textContent = line3
  $('line3').className = `line ${line3Tone}`
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
    if (action.primary && !action.disabled) btn.focus() // 回车即上传
  }
}

async function renderCounts(uploads) {
  let shots = 0
  try {
    shots = shotsToday(await storage.get(SHOT_COUNT_KEY), Date.now())
  } catch {
    // 读不到本地计数就显示 0，不让它变成未处理的异常
  }
  $('count-shots').textContent = String(shots)
  if (uploads !== undefined) $('count-uploads').textContent = uploads === null ? '—' : String(uploads)
}

function showNotice(text) {
  $('notice').hidden = !text
  $('notice').textContent = text || ''
}

// ---- 缩略图地址 ----------------------------------------------------------------

function urlFor(item) {
  let u = thumbUrls.get(item.id)
  if (u === undefined) {
    try {
      u = URL.createObjectURL(item.blob)
    } catch {
      u = '' // 记录被改坏、blob 不是 Blob：不显示图，别让整个弹窗崩掉
    }
    thumbUrls.set(item.id, u)
  }
  return u
}

// 不在暂存区、不是顶部这张、也不是确认页正在看的那张，缩略图地址回收掉
// （确认页传完会停留 1.5 秒显示「已上传」，那张已移出暂存区，图不能先没了）
function recycleUrls() {
  const keep = new Set(stashItems.map((it) => it.id))
  if (current && current.state !== 'deleted') keep.add(current.item.id)
  if (detailId) keep.add(detailId)
  for (const [id, u] of thumbUrls) {
    if (keep.has(id)) continue
    if (u) URL.revokeObjectURL(u)
    thumbUrls.delete(id)
  }
}

// ---- 暂存区 ------------------------------------------------------------------

async function refreshStash() {
  try {
    stashItems = await listStash()
  } catch {
    stashItems = [] // 读不到暂存区就当它是空的：顶部这张仍可直接上传
  }
  recycleUrls()
  renderStrip()
}

function renderStrip() {
  const now = Date.now()
  const items = stripOrder(stashItems)
  $('stash').hidden = items.length === 0
  $('stash-count').textContent = String(items.length)
  $('strip').replaceChildren(...items.map((it) => tile(it, now)))
}

function tile(it, now) {
  const b = document.createElement('button')
  b.type = 'button'
  const cls = ['tile']
  if (current && current.item.id === it.id) cls.push('current')
  if (it.partial) cls.push('partial')
  if (isStale(it, now)) cls.push('stale')
  b.className = cls.join(' ')
  b.title = `@${it.handle}`
  const img = document.createElement('span')
  img.className = 'tile-img'
  const u = urlFor(it)
  if (u) img.style.backgroundImage = `url(${u})`
  const time = document.createElement('span')
  time.className = 'tile-time'
  time.textContent = tileTime(it.reading && it.reading.capturedAt, now)
  const handle = document.createElement('span')
  handle.className = 'tile-handle'
  handle.textContent = `@${it.handle}`
  b.append(img, time, handle)
  b.addEventListener('click', () => openDetail(it.id))
  return b
}

// ---- 登录 / 退出 ---------------------------------------------------------------

function resetDetail() {
  if (backTimer) clearTimeout(backTimer)
  backTimer = null
  disarmDelete()
  detailId = null
}

function showLogin(message) {
  resetDetail()
  show('login')
  $('login-error').hidden = !message
  $('login-error').textContent = message || ''
  const target = $('email').value ? $('password') : $('email')
  target.focus()
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('login-btn').disabled = true
  const r = await api.login($('email').value.trim(), $('password').value).catch(() => 'network')
  $('password').value = ''
  $('login-btn').disabled = false
  if (r === 'ok') return start()
  showLogin(r === 'rejected' ? '邮箱或密码不对' : '网络不通，稍后再试')
})

$('logout').addEventListener('click', async () => {
  await api.logout().catch(() => {}) // 服务端吊销是尽力而为，本地会话无论如何都会清掉
  current = null
  stashItems = [] // 只是不显示；本地暂存区不清，重新登录后还在
  recycleUrls()
  uploadedThisOpen = false
  actionHandler = null
  showLogin()
})

// ---- 截图 --------------------------------------------------------------------

// 截可见区域 → 按画面矩形裁剪 → webp。返回 { blob } 或 { error: 给人看的一句话 }
async function captureCrop(tab, reading) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const r = cropRect(reading.clip.clip, reading.viewportWidth, bitmap.width, bitmap.height)
  if (!r) {
    bitmap.close()
    return { error: '请把直播画面完整滚进窗口' }
  }
  const canvas = new OffscreenCanvas(r.sw, r.sh)
  canvas.getContext('2d').drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh)
  bitmap.close()
  for (const quality of [0.92, 0.75, 0.6]) {
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
    if (blob.size <= MAX_BYTES) return { blob }
  }
  return { error: '截图过大，请缩小浏览器窗口后重试' }
}

function fail(handle, message, retry) {
  render({ name: handle ? `@${handle}` : '', line1: message, warn: true, action: { label: '重试', run: retry } })
}

async function prepare() {
  current = null
  showNotice('')
  render({ name: '读取中…' })
  recycleUrls()
  renderStrip()
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
  if (st.kind === 'error') return fail(handle, st.message, prepare)

  const shot = await captureCrop(tab, reading).catch(() => ({ error: '截图失败，可以重试' }))
  // 截图那一刻页面可能刚切走（SPA 切房）：再核对一次标签页网址，对不上就丢掉这张
  const after = await chrome.tabs.get(tab.id).catch(() => null)
  if (!after || handleFromLiveUrl(after.url) !== handle) return fail(handle, '页面刚切换了直播间，请重试', prepare)
  if (shot.error) return fail(handle, shot.error, prepare)

  try {
    await storage.set(SHOT_COUNT_KEY, bumpShots(await storage.get(SHOT_COUNT_KEY), Date.now()))
    await renderCounts()
  } catch {
    // 计数失败不影响就绪状态
  }
  const item = {
    id: crypto.randomUUID(),
    handle,
    blob: shot.blob,
    reading: {
      capturedAt: reading.capturedAt,
      viewer: reading.viewer || null,
      viewerSource: reading.viewerSource || null,
      coLive: reading.coLive || null,
      coLiveStatus: reading.coLiveStatus || null,
    },
    partial: false,
  }
  let notice = ''
  try {
    notice = evictionNotice(await insertStash(item), Date.now())
  } catch {
    notice = '本地暂存失败，这张只能现在上传'
  }
  current = { item, state: 'ready', name: '', message: '' }
  showNotice(notice)
  await refreshStash()
  renderCurrent()
}

// ---- 顶部卡片 ------------------------------------------------------------------

function renderCurrent() {
  if (!current) return
  const { item, state } = current
  const name = current.name || `@${item.handle}`
  if (state === 'deleted') return render({ name, line1: '这张已删掉', line1Tone: 'warn', action: { label: '重新截', run: prepare } })
  const thumbUrl = urlFor(item) || null
  if (state === 'uploading') return render({ name, line1: '上传中…', thumbUrl, action: { label: '上传中…', disabled: true } })
  if (state === 'uploaded') return render({ name, line1: '已上传', line1Tone: 'ok', thumbUrl, action: { label: '关闭', run: () => window.close() } })
  if (state === 'partial') {
    return render({ name, line1: '截图已上传，人数没写进去', line1Tone: 'warn', thumbUrl, action: { label: '补写人数', primary: true, run: uploadCurrent } })
  }
  if (state === 'error') return render({ name, line1: current.message, warn: true, thumbUrl, action: { label: '重试', run: uploadCurrent } })
  const co = coLiveLine(item.reading.coLiveStatus, item.reading.coLive)
  render({
    name,
    line1: '✓ 截图',
    line1Tone: 'ok',
    line2: item.reading.viewer ? '✓ 人数数据' : '⚠ 人数未读到',
    line2Tone: item.reading.viewer ? 'ok' : 'warn',
    line3: co.text,
    line3Tone: co.tone,
    thumbUrl,
    action: { label: '上传', primary: true, run: uploadCurrent },
  })
}

// 上传一条记录，按结果处理暂存区与底部计数，返回 uploadOutcome 的结果
async function sendItem(item) {
  const r = await api.upload(item).catch(() => ({ status: 0, body: { data: null, error: 'network_error' } }))
  const out = uploadOutcome(r, item.handle)
  if ('todayUploads' in out) {
    uploadedThisOpen = true
    renderCounts(out.todayUploads)
  }
  if (out.kind === 'login') {
    await api.logout().catch(() => {})
    return out
  }
  try {
    if (out.stash === 'remove') await removeStash(item.id)
    else if (out.stash === 'partial') await markPartial(item.id)
  } catch {
    // 暂存区没跟上：图还在，再传一次后台按截图时刻认出是同一张，不会多出一张
  }
  await refreshStash()
  return out
}

// 上传的恰好是顶部这张时，顶部卡片跟着变
function applyToCurrent(id, out) {
  if (!current || current.item.id !== id) return
  current.name = out.name || ''
  current.message = out.message || ''
  current.state = out.kind === 'ok' ? 'uploaded' : out.kind === 'partial' ? 'partial' : 'error'
  renderCurrent()
}

async function uploadCurrent() {
  const cur = current
  if (!cur || cur.state === 'uploading') return
  cur.state = 'uploading'
  renderCurrent()
  const out = await sendItem(cur.item)
  if (out.kind === 'login') return showLogin('登录已过期，请重新登录')
  applyToCurrent(cur.item.id, out)
}

// ---- 放大确认页 ----------------------------------------------------------------

function openDetail(id) {
  const it = stashItems.find((x) => x.id === id)
  if (!it) return
  resetDetail()
  detailId = id
  show('detail')
  renderDetail(it)
}

// status：{ text, tone } 覆盖默认的状态行；actionLabel 覆盖上传按钮文字
function renderDetail(it, status = null, actionLabel = null) {
  const rd = it.reading || {}
  const stale = isStale(it, Date.now())
  const u = urlFor(it)
  $('detail-img').style.backgroundImage = u ? `url(${u})` : ''
  $('detail-img').className = stale ? 'big stale' : 'big'
  $('detail-name').textContent = `@${it.handle} · ${stampTime(rd.capturedAt)}`
  $('detail-viewer').textContent = rd.viewer ? `人数 ${rd.viewer}` : '⚠ 人数未读到'
  $('detail-viewer').className = rd.viewer ? 'line' : 'line warn'
  const co = coLiveLine(rd.coLiveStatus, rd.coLive)
  $('detail-colive').textContent = co.text
  $('detail-colive').className = `line ${co.tone}`
  const st = status || (stale ? { text: '已过期，请重新截', tone: '' } : it.partial ? { text: '截图已上传，人数没写进去', tone: 'warn' } : null)
  $('detail-status').hidden = !st
  $('detail-status').textContent = st ? st.text : ''
  $('detail-status').className = st ? `line ${st.tone}` : 'line'
  const up = $('detail-upload')
  up.hidden = stale
  up.disabled = false
  up.textContent = actionLabel || (it.partial ? '补写人数' : '上传')
  $('detail-delete').disabled = false
  $('detail-back').disabled = false
  disarmDelete()
  if (!stale) up.focus()
}

function setDetailBusy(text) {
  for (const id of ['detail-upload', 'detail-delete', 'detail-back']) $(id).disabled = true
  $('detail-status').hidden = false
  $('detail-status').textContent = text
  $('detail-status').className = 'line'
}

function backToMain() {
  resetDetail()
  show('main')
}

function disarmDelete() {
  if (deleteTimer) clearTimeout(deleteTimer)
  deleteTimer = null
  $('detail-delete').textContent = '删掉'
}

$('detail-back').addEventListener('click', backToMain)

$('detail-upload').addEventListener('click', async () => {
  const it = stashItems.find((x) => x.id === detailId)
  if (!it || isStale(it, Date.now())) return
  // 顶部卡片正在传同一张：别重复发
  if (current && current.item.id === it.id && current.state === 'uploading') return
  setDetailBusy('上传中…')
  const out = await sendItem(it)
  if (out.kind === 'login') return showLogin('登录已过期，请重新登录')
  applyToCurrent(it.id, out)
  if (detailId !== it.id) return
  if (out.kind === 'ok') {
    $('detail-status').textContent = '已上传'
    $('detail-status').className = 'line ok'
    $('detail-back').disabled = false
    backTimer = setTimeout(backToMain, BACK_AFTER_UPLOAD_MS)
    return
  }
  const fresh = stashItems.find((x) => x.id === it.id) || { ...it, partial: it.partial || out.kind === 'partial' }
  if (out.kind === 'partial') return renderDetail(fresh, { text: '截图已上传，人数没写进去', tone: 'warn' }, '补写人数')
  renderDetail(fresh, { text: out.message, tone: 'warn' }, '重试')
})

// 删掉要点两次：暂存图还没上传，直播结束后就补不回来了
$('detail-delete').addEventListener('click', async () => {
  if (!deleteTimer) {
    $('detail-delete').textContent = '确认删掉'
    deleteTimer = setTimeout(disarmDelete, DELETE_CONFIRM_MS)
    return
  }
  disarmDelete()
  const id = detailId
  try {
    await removeStash(id)
  } catch {
    const it = stashItems.find((x) => x.id === id)
    if (it) renderDetail(it, { text: '删除失败，可以重试', tone: 'warn' })
    return
  }
  if (current && current.item.id === id && current.state !== 'uploaded') {
    current.state = 'deleted'
    renderCurrent()
  }
  await refreshStash()
  backToMain()
})

// ---- 启动 --------------------------------------------------------------------

async function start() {
  const session = await api.session().catch(() => null)
  if (!session) return showLogin()
  show('main')
  renderCounts()
  api
    .todayUploads()
    .then((n) => {
      if (!uploadedThisOpen) renderCounts(n)
    })
    .catch(() => {
      if (!uploadedThisOpen) renderCounts(null)
    })
  await refreshStash()
  await prepare()
}

start()
```

- [ ] **Step 5: 版本号与 README**

`manifest.json`：`"version": "0.1.0"` 改为 `"version": "0.2.0"`。

`README.md`：
- 开头第一段末尾的设计链接改为「设计见 `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`，第二版改动见 `docs/superpowers/specs/2026-10-11-live-shot-extension-v2-design.md`。」
- 「## 使用」一节整体替换为：

```markdown
## 使用

在 TikTok 直播间页面点图标，弹窗会自动截图并读人数；确认缩略图是这个房间后点「上传」。卡片第三行说明左侧 Following 区的同期人数读到了几个，没读到时写出原因（比如 TikTok 没登录、侧栏只有推荐区）。弹窗底部是今天（日本时间）的截图数与上传数，上传数按上传时刻计。

截不了图时弹窗会说原因：不是直播间页面、页面被双指缩放、直播画面没完整在窗口里、页面刚切换了直播间。

### 未上传的截图

每张截图都会先存在本机（插件自己的本地数据库），上传成功后移出，最多留最近 9 张，满了新截的会挤掉最旧的一张并提示。弹窗下方「未上传 N 张」一排缩略图，点一张放大确认后可以「上传」或「删掉」（删掉要点两次）。在任何页面打开弹窗都能处理这些图。

截图满 23 小时 50 分就置灰、只能删：后台只按截图时刻归档 24 小时内的图，再晚会改用服务器时间、归错日期。
```

- 「## 已知限制」一节整体替换为：

```markdown
## 已知限制

- 在直播间页面打开弹窗总会自动截一张，哪怕只是想处理积压；满 9 张时会挤掉最旧的一张。
- 未上传的截图只在当前浏览器、当前加载目录里，不跨浏览器同步；退出登录不清，换另一个后台账号登录后上传会记在新账号名下。
- Chrome 按加载目录区分未打包的插件：**换加载目录相当于换了一个插件**，要重新登录，原目录下的未上传截图不会跟过去。
- 没生成 `config.local.js` 时弹窗是空白的，先跑「安装」第 1 步。
```

- [ ] **Step 6: 语法检查与全量测试**

Run: `node --check extensions/live-shot/popup.js && node --check extensions/live-shot/lib/stashDb.js && node --check extensions/live-shot/lib/stash.js && node --check extensions/live-shot/lib/view.js && npm test && npx tsc --noEmit`
Expected: `node --check` 无输出；`npm test` 全部通过；tsc 无输出。

再核对 popup.js 引用的每个 DOM id 都在 popup.html 里：

Run: `for id in $(grep -o "\$('[a-z0-9-]*')" extensions/live-shot/popup.js | sed "s/\$('//;s/')//" | sort -u); do grep -q "id=\"$id\"" extensions/live-shot/popup.html || echo "缺 $id"; done`
Expected: 无输出。

- [ ] **Step 7: 提交**

```bash
git add extensions/live-shot/lib/stashDb.js extensions/live-shot/popup.html extensions/live-shot/popup.css extensions/live-shot/popup.js extensions/live-shot/manifest.json extensions/live-shot/README.md
git commit -m "feat(live-shot): 本地暂存未上传截图、放大确认后补传或删掉，弹窗显示侧栏同期状态

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 收尾——文档与更新日志、全量检查、真机验收

**Files:**
- Modify: `docs/competitors.md`（扩展说明段落）
- Modify: `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`（顶部一句指引）
- Modify: `src/lib/changelog/entries.ts`

**Interfaces:**
- Consumes: Task 1–6 的全部产出
- Produces: 可开 PR 的分支；真机验收记录

- [ ] **Step 1: 文档**

`docs/competitors.md` 里以 `` `extensions/live-shot/` `` 开头、描述扩展的那一段，把「弹窗显示日本时间当日的截图数与上传数。」改为「弹窗显示日本时间当日的截图数与上传数（上传数按上传时刻计）；没上传的截图在插件本地暂存最近 9 张，24 小时内补传仍按截图时刻归档。」，并把末尾的设计链接改为「设计见 `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`，第二版见 `docs/superpowers/specs/2026-10-11-live-shot-extension-v2-design.md`。」

第一版 spec 第一行标题之后插入一行空行和：

```markdown
> 第二版（本地暂存、24 小时窗口、侧栏按标题认 Following）见 `2026-10-11-live-shot-extension-v2-design.md`，本文第 6.1 节的 1 小时窗口与第 12.1 节相关限制已被它取代。
```

- [ ] **Step 2: 更新日志**

`src/lib/changelog/entries.ts` 的 `CHANGELOG` 数组顶部：若已有 `date: '2026-10-11'` 的条目就把下面两条追加进它的 `items`，否则新建一个 `{ date: '2026-10-11', items: [...] }` 放在数组最前：

```ts
      {
        kind: 'feat',
        scope: '竞品监测',
        title: '直播截图插件：没上传的截图会留在本机，可以之后再挑着传',
        details:
          '以前插件弹窗一关，没上传的截图就丢了。现在每张截图都会先存在本机，最多留最近 9 张；弹窗下方「未上传 N 张」一排缩略图，点开放大确认后可以上传或删掉，在任何页面打开弹窗都能处理。24 小时内补传的图仍按截图那一刻归档到对应日期，超过的会置灰提示重新截。\n\n弹窗底部「今日上传」改为按上传时刻统计：今天补传昨天截的图，今天的数也会加一。',
      },
      {
        kind: 'fix',
        scope: '竞品监测',
        title: '直播截图插件：侧栏只剩 Following 时也能读到同期人数，没读到会说原因',
        details:
          '插件读左侧 Following 区里同一时刻其它在播竞品的在线人数。之前当侧栏只有一个区块时一律当成「只剩推荐区」而不读，导致部分截图没有同期人数。现在按区块标题认出 Following；读不到时，截图卡片上会直接写出原因（比如 TikTok 没登录、侧栏只有推荐区），可以当场调整后重截。',
      },
```

- [ ] **Step 3: 全量检查（与 CI 同一套）**

Run: `npx tsc --noEmit && npm test && npm run test:copy`
Expected: 全部通过。

Run: `node --experimental-strip-types scripts/gen-extension-reader.mjs && git status --short extensions/live-shot/generated`
Expected: 无输出（生成文件已是最新）。

Run: `npx next build`
Expected: 退出码 0，且输出的路由表里有 `/api/competitors/quick-shot`（只看退出码不够：在刚跑过 dev 的 `.next` 上 build 可能静默早退，见仓库约定）。

- [ ] **Step 4: 提交**

```bash
git add docs/competitors.md docs/superpowers/specs/2026-10-09-live-shot-extension-design.md src/lib/changelog/entries.ts
git commit -m "docs(live-shot): 第二版文档与更新日志

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 真机验收环境（先跟负责人确认再开始）**

验收上传的是真实竞品截图、会写进生产库（与平时用插件相同），开始前先征得负责人同意。

1. worktree 根目录准备 `.env.local`（从主仓复制，已 gitignore，不提交）。
2. 起本 worktree 的后台：`npx next dev --port 3101`（按仓库的 worktree 预览约定，不用会跑主仓的那份启动配置）。
3. 生成插件配置指向它：`node --env-file=.env.local scripts/gen-extension-config.mjs --api-base http://localhost:3101`。
4. 请负责人在 `chrome://extensions` 里**另外**加载本 worktree 的 `extensions/live-shot`（旧目录那份不要动、不要删），用后台账号登录。

- [ ] **Step 6: 真机验收清单（负责人操作，逐项记录结果）**

1. 截 3 张不传，关弹窗再开 → 3 张都在，刚截的那张蓝框。
2. 点开其中一张上传 → 移出暂存区，「上传 M」加一；在竞品相册里出现在截图时刻对应的日期下。用只读 SQL 核对：`select count(*) from competitor_shots where created_by = <本人 id> and tag = 'live_manual' and created_at >= <今天日本 0 点> and created_at < <明天日本 0 点>` 等于弹窗「上传 M」。
3. 连续截到第 10 张 → 最旧的被挤掉，顶部有一行提示写明是哪张。
4. 点「删掉」后 3 秒不点 → 按钮复原；再点两次 → 删掉并回到主界面。
5. 在非直播间页面打开弹窗 → 顶部报「当前页不是直播间」，暂存区照常能点开、上传。
6. 退出再登录 → 暂存区还在。
7. 侧栏同期（要能分清「按标题认 Following」和「≥2 个取第一个」两条规则）：
   - 在直播间页面的 DevTools Console 先运行
     `[...document.querySelectorAll('[data-e2e="live-side-nav-channel"]')].map(c => c.querySelector('[data-e2e="live-side-nav-channel-title"]')?.textContent)`
     确认打出 Following 与推荐区两个标题（或本地化标题）。
   - 正常页面点插件：第三行「✓ 同期 N 个」，上传后查 `competitor_viewer_readings` 该次截图 `source = 'sidebar'` 的行数 = N 里在竞品库的账号数（只读）。
   - 模拟「侧栏只剩 Following」：在 Console 里把推荐区那个频道节点 `.remove()`，再点插件 → 第三行仍是「✓ 同期 N 个」（第一版规则这里会报没读到）。
   - 模拟「只剩推荐区」：刷新后把 Following 频道节点 `.remove()`，再点插件 → 第三行「⚠ 同期没读到：侧栏只有推荐区…」。
   - 测完刷新页面；这两次模拟截到的图在暂存区里删掉，不上传。
8. 过期置灰 / 坏时刻不白屏（Application 面板改不了 IndexedDB 的值，用 Console）：右键弹窗 →「检查」，在弹窗的 Console 运行
   ```js
   const db = await new Promise((ok, no) => { const r = indexedDB.open('live-shot'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
   const st = () => db.transaction('stash', 'readwrite').objectStore('stash')
   const [it] = await new Promise((ok) => { const r = st().getAll(); r.onsuccess = () => ok(r.result) })
   it.reading.capturedAt = Date.now() - 24 * 3600e3; st().put(it)
   ```
   关掉再开弹窗：该图置灰、时间带「昨」或日期，点开只有「删掉」「返回」和「已过期，请重新截」。再把赋值改成 `'x'` 重跑一遍、重开弹窗：不白屏，该图时间显示「—」且只能删。
9. 再截一张：截好后点「再截一张」→ 卡片换成新图，上一张留在「未上传」；快速双击它只截一张，也不会弹出确认页；上传成功后按钮变成「再截一张」，点了继续截；暂存满 9 张时再截照常挤掉最旧的并提示。

任何一项不符：记下现象，回到对应任务修复（新提交），修完重跑 Step 3 与对应验收项。

- [ ] **Step 7: 收尾**

验收全部通过后，停掉第 5 步起的 dev server；进入 superpowers:finishing-a-development-branch（推分支、开 PR；合并前一律先问负责人）。
