# 导航信息架构重组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把内部后台侧边栏的 11 个一级入口收拢成 7 个按业务归属组织的入口，路由 URL 一律不变。

**Architecture:** 导航的**纯匹配逻辑**（query 解析、激活判定、href 拼装）抽到新模块 `src/lib/nav/nav.ts` 并配单测；`NAV` 数据常量和 `NAV_ACCENT` 色板留在 `Sidebar.tsx`（它们持有 lucide 组件实例，搬进 lib 会污染测试链）。`/tasks` 一页两 tab 通过 URL query `?view=workload|ai` 拆成两个导航入口，页面与导航共用同一个 `resolveNavQuery` 兜底函数。

**Tech Stack:** Next.js 15 App Router、next-intl、TypeScript、`node --test --experimental-strip-types`、Tailwind。

**设计稿：** `docs/superpowers/specs/2026-09-04-nav-ia-consolidation-design.md`

**工作区：** `/Users/fengzhou/Code/newWith-nav`，分支 `feat/nav-ia-consolidation`（基于 origin/main `488e9f2`）。**所有命令都在这个目录跑，不要在 `/Users/fengzhou/Code/newWith` 主仓操作**——主仓有其他会话未提交的改动。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/lib/nav/nav.ts` | 新建 | 导航类型定义 + 纯匹配逻辑。不 import 任何运行时依赖（lucide 只作类型引用）。 |
| `src/lib/nav/nav.test.ts` | 新建 | 上面那个模块的单测。 |
| `package.json` | 修改 | 把新测试文件登记进 `test` 脚本，否则 CI 不跑它。 |
| `messages/zh.json` | 修改 | `nav` 命名空间重排。 |
| `messages/en.json` | 修改 | 同上。 |
| `messages/ja.json` | 修改 | 同上。 |
| `src/components/layout/Sidebar.tsx` | 修改 | `NAV` 重排、`NAV_ACCENT` 重新登记、React key 修复、接 `isNavActive`。 |
| `src/app/[locale]/(app)/tasks/page.tsx` | 修改 | `mainTab` 改由 URL query 驱动。 |

---

### Task 1: `src/lib/nav/nav.ts` —— 纯匹配逻辑 + 单测

**Files:**
- Create: `src/lib/nav/nav.ts`
- Create: `src/lib/nav/nav.test.ts`
- Modify: `package.json`（`scripts.test`）

- [ ] **Step 1: 先写失败的测试**

创建 `src/lib/nav/nav.test.ts`：

```ts
// src/lib/nav/nav.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { hrefWithQuery, isNavActive, resolveNavQuery } from './nav.ts'

// 无 query 的 leaf —— 现有行为一条都不能变
test('leaf without query: exact 精确匹配，非 exact 匹配自身与子路径', () => {
  const params = new URLSearchParams()
  assert.equal(isNavActive('/creators', params, { href: '/creators', exact: true }), true)
  assert.equal(isNavActive('/creators/abc', params, { href: '/creators', exact: true }), false)
  assert.equal(isNavActive('/expenses', params, { href: '/expenses' }), true)
  assert.equal(isNavActive('/expenses/2026', params, { href: '/expenses' }), true)
  assert.equal(isNavActive('/timeline', params, { href: '/expenses' }), false)
})

test('根路径只在自己身上亮，不做前缀匹配', () => {
  const params = new URLSearchParams()
  assert.equal(isNavActive('/', params, { href: '/' }), true)
  assert.equal(isNavActive('/creators', params, { href: '/' }), false)
})

test('兄弟路径共享前缀时不互相串亮', () => {
  const params = new URLSearchParams()
  // /team 是 exact，/team/assignments 不该把它点亮
  assert.equal(isNavActive('/team/assignments', params, { href: '/team', exact: true }), false)
  // 裸前缀延长（/teamfoo）不该匹配 /team —— 旧的 startsWith 实现会误亮
  assert.equal(isNavActive('/teamfoo', params, { href: '/team' }), false)
})

// query 深链 —— 本轮新增能力
test('?view=ai 只点亮 AI 任务那一条', () => {
  const params = new URLSearchParams('view=ai')
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), false)
})

test('?view=workload 只点亮人员任务那一条', () => {
  const params = new URLSearchParams('view=workload')
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('裸 /tasks 走页面默认 tab，不出现两条都不亮', () => {
  const params = new URLSearchParams()
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('非法 view 值回落到默认 tab，同样不会两条都不亮', () => {
  const params = new URLSearchParams('view=bogus')
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('pathname 不匹配时，query 对得上也不亮', () => {
  const params = new URLSearchParams('view=ai')
  assert.equal(isNavActive('/timeline', params, { href: '/tasks', query: { view: 'ai' } }), false)
})

test('searchParams 为 null（SSR 首帧）时按默认值判定', () => {
  assert.equal(isNavActive('/tasks', null, { href: '/tasks', query: { view: 'workload' } }), true)
  assert.equal(isNavActive('/tasks', null, { href: '/tasks', query: { view: 'ai' } }), false)
})

// resolveNavQuery —— 导航和 /tasks 页面共用的兜底口径
test('resolveNavQuery 把缺失和非法值都收敛到默认值', () => {
  assert.equal(resolveNavQuery('/tasks', 'view', null), 'workload')
  assert.equal(resolveNavQuery('/tasks', 'view', 'bogus'), 'workload')
  assert.equal(resolveNavQuery('/tasks', 'view', 'ai'), 'ai')
  assert.equal(resolveNavQuery('/tasks', 'view', 'workload'), 'workload')
})

test('resolveNavQuery 对未登记的路径/参数原样返回', () => {
  assert.equal(resolveNavQuery('/expenses', 'view', null), null)
  assert.equal(resolveNavQuery('/expenses', 'view', 'x'), 'x')
  assert.equal(resolveNavQuery('/tasks', 'unknown', null), null)
})

// hrefWithQuery
test('hrefWithQuery 无 query 时原样返回，有 query 时拼上问号', () => {
  assert.equal(hrefWithQuery({ href: '/expenses' }), '/expenses')
  assert.equal(hrefWithQuery({ href: '/tasks', query: { view: 'ai' } }), '/tasks?view=ai')
  assert.equal(hrefWithQuery({ href: '/tasks', query: {} }), '/tasks')
})
```

- [ ] **Step 2: 跑一遍确认它失败**

```bash
cd /Users/fengzhou/Code/newWith-nav && node --test --experimental-strip-types src/lib/nav/nav.test.ts
```

Expected: FAIL —— `Cannot find module '.../src/lib/nav/nav.ts'`。

- [ ] **Step 3: 写实现**

创建 `src/lib/nav/nav.ts`：

```ts
// 内部后台侧边栏导航的纯匹配逻辑。放在 lib 而不是 Sidebar.tsx 里，是因为本轮
// 引入了「同一个 href 挂两个导航入口、靠 query 区分」的深链（/tasks 的人员工时
// tab 与 AI 任务 tab），激活判定不再是一句 startsWith 能说清的事，需要测试兜住。
//
// `NAV` 数据常量和 `NAV_ACCENT` 色板刻意留在 Sidebar.tsx：它们每一项都持有
// lucide 图标组件实例，搬进来会让 nav.test.ts 在 node --test 下连带加载
// lucide-react 和 react。本仓所有测试都只 import 纯 .ts 模块，不破这个例。
// 下面对 LucideIcon 只有类型引用，strip-types 会整条擦掉，不产生运行时依赖。
import type { LucideIcon } from 'lucide-react'

/** 导航项挂的 URL query。同一个 href 靠它区分成多个入口。 */
export type NavQuery = Readonly<Record<string, string>>

export type NavLeaf = {
  href: string
  key: string
  icon: LucideIcon
  /** 精确匹配 pathname。某个 href 是兄弟项的前缀时必须开（如 /team vs /team/org）。 */
  exact?: boolean
  /** 带上它，这一项只在 URL query 也对得上时才算激活。 */
  query?: NavQuery
}

export type NavGroup = { key: string; icon: LucideIcon; children: readonly NavLeaf[] }
export type NavItem  = NavLeaf | NavGroup

export const isGroup = (item: NavItem): item is NavGroup => 'children' in item

/**
 * 带默认值的 query 参数登记表。
 *
 * 页面自己有默认 tab，所以「URL 上没有这个参数」等价于「参数等于默认值」。
 * 不登记的话，首次进 /tasks（URL 上没有 ?view=）会让人员任务和 AI 任务两个
 * 入口都不亮；?view=bogus 这种脏值同理。`values` 把合法取值也一并锁住，
 * 页面的 tab 回退和导航的高亮判定于是共用同一份口径，不可能跑偏。
 */
type QuerySpec = { readonly default: string; readonly values: readonly string[] }

const QUERY_SPECS: Readonly<Record<string, Readonly<Record<string, QuerySpec>>>> = {
  '/tasks': { view: { default: 'workload', values: ['workload', 'ai'] } },
}

/**
 * 把一个原始 query 值收敛成页面真正会用的值：缺失或非法都回落到默认值。
 * 未登记的 href/参数原样透传（返回 null 表示 URL 上确实没有）。
 */
export function resolveNavQuery(href: string, name: string, raw: string | null): string | null {
  const spec = QUERY_SPECS[href]?.[name]
  if (!spec) return raw
  return raw !== null && spec.values.includes(raw) ? raw : spec.default
}

/**
 * pathname 匹配。
 *
 * 比原先的裸 `startsWith(href)` 收紧了一档：要么整段相等，要么后面跟的是 `/`。
 * 旧写法会让 /team 误亮在 /teamfoo 上。当前 NAV 里没有任何一条路由是另一条的
 * 裸前缀延长，所以这是行为等价的加固，不改变今天任何一处高亮。
 */
function pathMatches(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * 导航项激活判定。`searchParams` 传 null 表示还拿不到（SSR 首帧），
 * 此时全部参数按默认值算。
 */
export function isNavActive(
  pathname: string,
  searchParams: URLSearchParams | null,
  leaf: Pick<NavLeaf, 'href' | 'exact' | 'query'>,
): boolean {
  if (!pathMatches(pathname, leaf.href, leaf.exact)) return false
  if (!leaf.query) return true
  for (const [name, want] of Object.entries(leaf.query)) {
    const raw = searchParams?.get(name) ?? null
    if (resolveNavQuery(leaf.href, name, raw) !== want) return false
  }
  return true
}

/** 渲染 <Link href> 用：把 leaf 上登记的 query 拼回 URL。 */
export function hrefWithQuery(leaf: Pick<NavLeaf, 'href' | 'query'>): string {
  if (!leaf.query) return leaf.href
  const qs = new URLSearchParams(leaf.query).toString()
  return qs ? `${leaf.href}?${qs}` : leaf.href
}
```

- [ ] **Step 4: 跑测试确认全绿**

```bash
cd /Users/fengzhou/Code/newWith-nav && node --test --experimental-strip-types src/lib/nav/nav.test.ts
```

Expected: PASS，`# pass 12`、`# fail 0`。

- [ ] **Step 5: 把测试文件登记进 `package.json` 的 `test` 脚本**

`scripts.test` 是一条超长的 `node --test --experimental-strip-types <一堆文件>`。**没登记的测试文件 CI 完全不会跑**——本仓踩过这个坑。在 `src/lib/ui/scrollLock.test.ts` 后面插入 `src/lib/nav/nav.test.ts`：

```bash
cd /Users/fengzhou/Code/newWith-nav && node -e "
const fs = require('fs')
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const anchor = 'src/lib/ui/scrollLock.test.ts'
if (p.scripts.test.includes('src/lib/nav/nav.test.ts')) { console.log('already registered'); process.exit(0) }
if (!p.scripts.test.includes(anchor)) { console.error('anchor not found'); process.exit(1) }
p.scripts.test = p.scripts.test.replace(anchor, anchor + ' src/lib/nav/nav.test.ts')
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')
console.log('registered')
"
```

**注意**：这个脚本会用 `JSON.stringify(…, null, 2)` 重写整个 `package.json`。跑完必须 `git diff package.json` 确认只有 `test` 那一行变了；如果缩进或键序被改乱，改成手工编辑那一行。

- [ ] **Step 6: 确认全量测试通过**

```bash
cd /Users/fengzhou/Code/newWith-nav && npm test 2>&1 | tail -15
```

Expected: `# fail 0`，且总测试数比改动前多 12。

- [ ] **Step 7: 突变探针 —— 证明这些测试真的会杀**

测试全绿不等于测试有效。在**已提交的基线上**跑（本仓踩过「探针里的 git checkout 冲掉未提交实现」的坑），所以先提交，再探。

```bash
cd /Users/fengzhou/Code/newWith-nav && git add src/lib/nav/nav.ts src/lib/nav/nav.test.ts package.json && git commit -q -m "feat(nav): 抽出导航匹配逻辑与 query 深链支持

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

然后逐条注入变异，每条都必须让测试变红：

```bash
cd /Users/fengzhou/Code/newWith-nav

# 变异 1：query 匹配整个失效（永远返回 true）
sed -i '' 's|  if (!leaf.query) return true|  if (!leaf.query) return true\n  return true|' src/lib/nav/nav.ts
node --test --experimental-strip-types src/lib/nav/nav.test.ts 2>&1 | tail -3
git checkout src/lib/nav/nav.ts

# 变异 2：默认值兜底失效（缺失参数直接返回 null）
sed -i '' 's|  return raw !== null \&\& spec.values.includes(raw) ? raw : spec.default|  return raw|' src/lib/nav/nav.ts
node --test --experimental-strip-types src/lib/nav/nav.test.ts 2>&1 | tail -3
git checkout src/lib/nav/nav.ts

# 变异 3：pathname 匹配退回裸 startsWith
sed -i '' 's|  return pathname === href \|\| pathname.startsWith(`${href}/`)|  return pathname.startsWith(href)|' src/lib/nav/nav.ts
node --test --experimental-strip-types src/lib/nav/nav.test.ts 2>&1 | tail -3
git checkout src/lib/nav/nav.ts

# 变异 4：exact 被忽略
sed -i '' 's|  if (exact) return pathname === href||' src/lib/nav/nav.ts
node --test --experimental-strip-types src/lib/nav/nav.test.ts 2>&1 | tail -3
git checkout src/lib/nav/nav.ts
```

Expected: **四条变异全部 `# fail` 大于 0**。任何一条仍然全绿，说明对应的断言是假的，回到 Step 1 补测试。

跑完确认工作区干净：

```bash
cd /Users/fengzhou/Code/newWith-nav && git status --short
```

Expected: 无输出。

---

### Task 2: 三语文案

**Files:**
- Modify: `messages/zh.json`（`nav` 命名空间）
- Modify: `messages/en.json`（`nav` 命名空间）
- Modify: `messages/ja.json`（`nav` 命名空间）

先做文案再改组件，这样 Task 3 改完 Sidebar 一刷新就是成品，不会经过一屏裸 key 的中间态。

**保留不动的 key**（有其他消费者或文案不变）：`profile`、`logout`、`appName`（`login/page.tsx` 在用）、`appSubtitle`、`creatorsList`、`competitors`、`recruitApplications`、`teamOrg`、`costManagement`、`expenses`、`items`、`venue`、`financeForecast`、`knowledge`、`siteContentNews`、`siteMembers`。

**删除的 key**（改完后全库无引用，已核对：`nav` 命名空间只有 `Sidebar.tsx`、`login/page.tsx`、`ProfileEditor.tsx` 三个消费者，后两者只用 `appName` / `logout`）：`dashboard`、`creators`、`pipeline`、`timeline`、`tasks`、`workspace`、`team`、`config`。

**新增/改写的 key**：

- [ ] **Step 1: 改 `messages/zh.json` 的 `nav` 命名空间**

把整个 `nav` 对象替换成：

```json
  "nav": {
    "workbench": "工作台",
    "creatorOps": "创作者运营",
    "recruitApplications": "官网应募",
    "creatorsList": "创作者列表",
    "lifecycleBoard": "生命周期看板",
    "competitors": "竞品监测",
    "teamwork": "团队协作",
    "workTasks": "人员任务与工时",
    "milestones": "战略里程碑",
    "teamOrg": "业务分工",
    "costManagement": "成本管理",
    "expenses": "支出管理",
    "items": "物品资产",
    "venue": "场地布置",
    "financeForecast": "财务预测",
    "aiAssistant": "AI 助手",
    "aiChat": "AI 对话",
    "aiTasks": "AI 任务",
    "teamAssignments": "代理任务分配",
    "teamAgents": "代理配置",
    "knowledge": "知识库",
    "siteContent": "官网管理",
    "siteContentNews": "新闻管理",
    "siteMembers": "成员管理",
    "settings": "系统设置",
    "profile": "个人信息",
    "logout": "退出登录",
    "appName": "Creator Network",
    "appSubtitle": "AI 运营系统"
  },
```

- [ ] **Step 2: 改 `messages/en.json` 的 `nav` 命名空间**

```json
  "nav": {
    "workbench": "Workbench",
    "creatorOps": "Creator Ops",
    "recruitApplications": "Site applications",
    "creatorsList": "Creator list",
    "lifecycleBoard": "Lifecycle Board",
    "competitors": "Competitors",
    "teamwork": "Team Collaboration",
    "workTasks": "Tasks & Workload",
    "milestones": "Strategic Milestones",
    "teamOrg": "Org & Roles",
    "costManagement": "Cost Management",
    "expenses": "Expense Management",
    "items": "Item Management",
    "venue": "Venue Layout",
    "financeForecast": "Finance Forecast",
    "aiAssistant": "AI Assistant",
    "aiChat": "AI Chat",
    "aiTasks": "AI Tasks",
    "teamAssignments": "Agent Assignments",
    "teamAgents": "Agent Config",
    "knowledge": "Knowledge",
    "siteContent": "Site Content",
    "siteContentNews": "News",
    "siteMembers": "Members",
    "settings": "System Settings",
    "profile": "Profile",
    "logout": "Logout",
    "appName": "Creator Network",
    "appSubtitle": "AI Operating System"
  },
```

- [ ] **Step 3: 改 `messages/ja.json` 的 `nav` 命名空间**

日语沿用该 locale 现有约定：创作者叫「ライバー」不是「クリエイター」。

```json
  "nav": {
    "workbench": "ホーム",
    "creatorOps": "ライバー運営",
    "recruitApplications": "サイト応募",
    "creatorsList": "ライバー一覧",
    "lifecycleBoard": "ライフサイクルボード",
    "competitors": "競合モニタリング",
    "teamwork": "チーム連携",
    "workTasks": "人員タスク・工数",
    "milestones": "戦略マイルストーン",
    "teamOrg": "業務分担",
    "costManagement": "コスト管理",
    "expenses": "支出管理",
    "items": "備品管理",
    "venue": "会場レイアウト",
    "financeForecast": "財務予測",
    "aiAssistant": "AIアシスタント",
    "aiChat": "AIチャット",
    "aiTasks": "AIタスク",
    "teamAssignments": "エージェント割り当て",
    "teamAgents": "エージェント設定",
    "knowledge": "ナレッジ",
    "siteContent": "サイト管理",
    "siteContentNews": "ニュース管理",
    "siteMembers": "メンバー管理",
    "settings": "システム設定",
    "profile": "プロフィール",
    "logout": "ログアウト",
    "appName": "Creator Network",
    "appSubtitle": "AI 運営システム"
  },
```

- [ ] **Step 4: 跑 i18n 门禁**

```bash
cd /Users/fengzhou/Code/newWith-nav && npm run test:i18n
```

Expected: 三语 key parity 通过。**`nav.*` 的键在 Sidebar 里是 `t(item.key)` 动态取的，静态分析看不见，所以会进「unused messages」告警**——该检查是 warning-only，不 fatal。确认输出里没有 `missing reference` 类的 fatal 错误即可。

- [ ] **Step 5: 提交**

```bash
cd /Users/fengzhou/Code/newWith-nav && git add messages/zh.json messages/en.json messages/ja.json && git commit -q -m "feat(nav): 导航文案按新信息架构三语重排

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Sidebar 接线

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: 换掉 import 头部**

删掉文件里本地定义的 `NavLeaf` / `NavGroup` / `NavItem` / `isGroup`（第 42-44 行附近的 type 定义和 `const isGroup = ...`），改从新模块引入；同时补上 `useSearchParams` 和两个新图标。

`import { Link, usePathname } from '@/i18n/navigation'` 这一行**保持不动**（`usePathname` 必须用 next-intl 的，它返回去掉 locale 前缀的路径）。在它下面加一行：

```ts
import { useSearchParams } from 'next/navigation'
```

lucide 的 import 块里加 `Sparkles` 和 `UsersRound`（`Zap` 保留，logo 在用；`UserCircle` 保留，profile 在用）。

原来的类型定义那三行：

```ts
type NavLeaf  = { href: string; key: string; icon: LucideIcon; exact?: boolean }
type NavGroup = { key: string; icon: LucideIcon; children: readonly NavLeaf[] }
type NavItem  = NavLeaf | NavGroup
```

替换成：

```ts
import type { NavGroup, NavItem, NavLeaf } from '@/lib/nav/nav'
import { hrefWithQuery, isGroup, isNavActive } from '@/lib/nav/nav'
```

（import 语句要提到文件顶部的 import 块里，不能留在原来的位置。）

同时删掉这一行：

```ts
const isGroup = (item: NavItem): item is NavGroup => 'children' in item
```

`import type { LucideIcon } from 'lucide-react'` 如果没有其他用处也一并删掉——**删之前先 `grep -n 'LucideIcon' src/components/layout/Sidebar.tsx` 确认**。

- [ ] **Step 2: 重写 `NAV` 常量**

把 `const NAV = [ ... ] as const satisfies readonly NavItem[]` 整块替换成：

```ts
// `as const satisfies` 保留字面量 key 类型（供下方 NAV_ACCENT 派生），同时仍按
// NavItem 结构校验每一项。
//
// 一级入口按业务归属组织，不按模块堆叠（docs/superpowers/specs/
// 2026-09-04-nav-ia-consolidation-design.md）。/tasks 出现两次是有意的：
// 那一页有「人员工时」和「AI 任务」两个 tab，分属两条业务线，靠 query 拆成
// 两个入口——所以下面的渲染必须用 item.key 而不是 item.href 做 React key。
const NAV = [
  { href: '/', key: 'workbench', icon: LayoutDashboard },
  {
    key: 'creatorOps',
    icon: Users,
    children: [
      // 官网 RECRUIT 表单的投递：招募来的人最终进 creators，归在同一组
      { href: '/recruit-applications', key: 'recruitApplications', icon: Inbox },
      { href: '/creators',    key: 'creatorsList',   icon: Users, exact: true },
      { href: '/pipeline',    key: 'lifecycleBoard', icon: GitBranch },
      { href: '/competitors', key: 'competitors',    icon: Radar },
    ],
  },
  {
    key: 'teamwork',
    icon: UsersRound,
    children: [
      { href: '/tasks',    key: 'workTasks',  icon: CheckSquare,   query: { view: 'workload' } },
      { href: '/timeline', key: 'milestones', icon: CalendarRange },
      { href: '/team/org', key: 'teamOrg',    icon: Network },
    ],
  },
  {
    key: 'costManagement',
    icon: Wallet,
    children: [
      { href: '/expenses',         key: 'expenses',        icon: Receipt },
      { href: '/items',            key: 'items',           icon: Package },
      { href: '/guild-venue',      key: 'venue',           icon: MapIcon },
      { href: '/finance-forecast', key: 'financeForecast', icon: TrendingUp },
    ],
  },
  {
    key: 'aiAssistant',
    icon: Bot,
    children: [
      { href: '/workspace',        key: 'aiChat',          icon: MessageSquare },
      { href: '/tasks',            key: 'aiTasks',         icon: Sparkles, query: { view: 'ai' } },
      { href: '/team/assignments', key: 'teamAssignments', icon: ClipboardList },
      { href: '/team',             key: 'teamAgents',      icon: Bot, exact: true },
      { href: '/knowledge',        key: 'knowledge',       icon: BookOpen },
    ],
  },
  // 官网内容后台管理入口（新闻 + 成员）
  {
    key: 'siteContent',
    icon: Newspaper,
    children: [
      { href: '/site-content/news',    key: 'siteContentNews', icon: Newspaper, exact: true },
      { href: '/site-content/members', key: 'siteMembers',     icon: Users },
    ],
  },
  { href: '/config', key: 'settings', icon: Settings },
] as const satisfies readonly NavItem[]
```

- [ ] **Step 3: 重写 `NAV_ACCENT`**

`NAV_ACCENT` 的 `Record<TopNavKey, Accent>` 有编译期漏登记检查——7 个一级入口少登记一个会直接编译失败。整块替换：

```ts
const NAV_ACCENT: NavAccentMap = {
  // 一级入口（§1.4 六色板，7 个入口所以 mauve 用两次：首尾的工作台与系统设置）
  workbench: 'mauve', creatorOps: 'pink', teamwork: 'blue', costManagement: 'green',
  aiAssistant: 'violet', siteContent: 'amber', settings: 'mauve',
  // 子项覆盖色。未登记的子项继承所属一级入口的色（见 accentOf 调用处的
  // parentAccent）。这里登记的几条，是为了让原本身为一级入口、有固定色的项
  // 降级成子项后保住原色，用户不会觉得"这东西被换了个颜色"。
  recruitApplications: 'pink',
  lifecycleBoard: 'blue',   // 原一级菜单 pipeline
  workTasks: 'green',       // 原一级菜单 tasks
  milestones: 'violet',     // 原一级菜单 timeline
  teamOrg: 'green',
  expenses: 'violet', items: 'amber', venue: 'violet', financeForecast: 'green',
  aiChat: 'blue',           // 原一级菜单 workspace
  aiTasks: 'green',
  teamAssignments: 'blue',
  teamAgents: 'violet',
  knowledge: 'amber',       // 原一级菜单 knowledge
}
```

- [ ] **Step 4: 修 React key + 接 query href/激活判定**

四处改动，逐一改：

**(a) 把组件内的 `isActive` 整个换掉**——不是新增一个，是**删掉旧的那三行**（`const isActive = (href: string, exact = false) => ...` 连同上面那段 `// \`exact\` matches the pathname exactly ...` 注释），原地写新的。留着旧的会变成未引用变量，lint 直接红。

```ts
  const searchParams = useSearchParams()

  // 激活判定移到 @/lib/nav/nav（有单测）。带 query 的项（/tasks 的两个 tab
  // 入口）需要 searchParams 参与，且 URL 上没有该参数时按页面默认 tab 算。
  const leafActive = (leaf: Pick<NavLeaf, 'href' | 'exact' | 'query'>) =>
    isNavActive(path, searchParams, leaf)
```

`const searchParams = useSearchParams()` 放在 `const path = usePathname()` 下面。

**(b) `renderLeaf` 的 React key 和 href**：

```ts
  const renderLeaf = (item: NavLeaf, indented = false, parentAccent?: Accent) => {
    const active = leafActive(item)
    if (effectiveCollapsed) {
      return <CollapsedNavLeaf key={item.key} item={item} label={t(item.key)} active={active} />
    }
    const Icon = item.icon
    const accent = accentOf(item.key) ?? parentAccent ?? 'mauve'
    return (
      <Link
        key={item.key}
        href={hrefWithQuery(item)}
        onClick={active ? () => notifyNavReset() : undefined}
        ...
```

**`key` 从 `item.href` 改成 `item.key` 是必须的**：`/tasks` 在 NAV 里出现两次，href 不再唯一，React 会报 duplicate key 并在两项之间错乱复用 DOM。

**(c) `CollapsedNavLeaf` 里的 `<Link href>`**（组件顶层那个函数）：

```tsx
      <Link
        href={hrefWithQuery(item)}
        aria-label={label}
        ...
```

**(d) `CollapsedNavGroup` 的 children map**——它的 `isActive` prop 签名要跟着换。把该组件的 props 从

```ts
  isActive: (href: string, exact?: boolean) => boolean
```

改成

```ts
  isActive: (leaf: Pick<NavLeaf, 'href' | 'exact' | 'query'>) => boolean
```

组件体内两处调用点：

```ts
  const hasActiveChild = item.children.some((c) => isActive(c))
```

和 children map 里：

```tsx
          {item.children.map((child) => {
            const ChildIcon = child.icon
            const active = isActive(child)
            const childAccent = accentOf(child.key) ?? accent
            return (
              <Link
                key={child.key}
                href={hrefWithQuery(child)}
                ...
```

（`key={child.href}` → `key={child.key}`，`href={child.href}` → `href={hrefWithQuery(child)}`。）

**(e) 折叠态渲染处传参**（`<CollapsedNavGroup ... isActive={isActive} />`）改成 `isActive={leafActive}`。

**(f) 展开态 group 的 `hasActiveChild`**（`nav` 里那处 `item.children.some((c) => isActive(c.href, c.exact))`）改成：

```ts
          const hasActiveChild = item.children.some((c) => leafActive(c))
```

- [ ] **Step 5: 修掉 `NAV_ITEMS` 上方的过期注释**

`const NAV_ITEMS: readonly NavItem[] = NAV` 上面那段注释开头写着「`NAV` 的字面量元组类型有 10 个互不相同的成员形状」——现在是 7 个。把「10 个」改成「7 个」，其余保留（那段解释的是为什么渲染遍历要用这个宽类型别名，理由没变）。

- [ ] **Step 6: 类型检查**

```bash
cd /Users/fengzhou/Code/newWith-nav && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无输出。有报错就按报错修——尤其留意 `NAV_ACCENT` 的漏登记检查和 `CollapsedNavGroup` 的 props 签名。

- [ ] **Step 7: lint + style 门禁**

```bash
cd /Users/fengzhou/Code/newWith-nav && npm run lint -- --max-warnings=0 && npm run test:style
```

Expected: 双绿。style 门禁会把注释里的裸 hex 当违规——上面的注释里没有 `#` 开头的东西，但**如果后续补注释时要提 PR 编号，写成 `PR 198` 不要写 `(#198)`**，本仓踩过这个坑。

- [ ] **Step 8: 提交**

```bash
cd /Users/fengzhou/Code/newWith-nav && git add src/components/layout/Sidebar.tsx && git commit -q -m "feat(nav): 侧边栏收拢成 7 个按业务归属组织的一级入口

11 个一级入口重排为 工作台/创作者运营/团队协作/成本管理/AI 助手/
官网管理/系统设置。路由 URL 一律不变。/tasks 靠 query 拆成两个入口，
React key 随之从 href 改成 key（href 不再唯一）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `/tasks` 页面的 tab 由 URL 驱动

**Files:**
- Modify: `src/app/[locale]/(app)/tasks/page.tsx`

- [ ] **Step 1: 换掉 `mainTab` 的 state**

当前第 49 行是：

```ts
  const [mainTab, setMainTab] = useState<'ai' | 'workload'>('workload')
```

改成从 URL 派生。**必须是派生而不是 `useState` + 初始值**：用户在 `/tasks?view=workload` 页面上点侧栏的「AI 任务」时，URL 变了但组件没有卸载，`useState` 的初始值不会重跑，tab 会卡在原地不动。

```ts
  // tab 状态挂在 URL 上，侧栏的「人员任务与工时」和「AI 任务」是同一页的两个
  // 深链入口（@/lib/nav/nav 的 QUERY_SPECS 登记了 view 的合法值与默认值，
  // 导航高亮和这里的回退共用那一份口径，不会跑偏）。
  const searchParams = useSearchParams()
  const router       = useRouter()
  const mainTab: 'ai' | 'workload' =
    resolveNavQuery('/tasks', 'view', searchParams.get('view')) === 'ai' ? 'ai' : 'workload'
  const setMainTab = useCallback(
    (v: 'ai' | 'workload') => { router.replace(hrefWithQuery({ href: '/tasks', query: { view: v } })) },
    [router],
  )
```

补 import（`useCallback` 已在该文件的 react import 里）：

```ts
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { hrefWithQuery, resolveNavQuery } from '@/lib/nav/nav'
```

`useRouter` 用 `@/i18n/navigation` 那个，它会自动带上 locale 前缀；用 `next/navigation` 的会把用户踢到无 locale 的路径。

- [ ] **Step 2: 确认 Tabs 的 onChange 不用改**

现有代码是：

```tsx
            onChange={(v) => setMainTab(v as 'ai' | 'workload')}
```

`setMainTab` 现在是个普通函数而不是 setState，签名兼容，这行不动。

- [ ] **Step 3: 类型检查**

```bash
cd /Users/fengzhou/Code/newWith-nav && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
cd /Users/fengzhou/Code/newWith-nav && git add "src/app/[locale]/(app)/tasks/page.tsx" && git commit -q -m "feat(tasks): tab 状态接到 URL query，支持从侧栏深链直达

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 全量验收

**Files:** 无改动（除非验收暴露问题）

- [ ] **Step 1: 全套门禁**

```bash
cd /Users/fengzhou/Code/newWith-nav && npm test 2>&1 | tail -8 && npm run test:copy 2>&1 | tail -20
```

Expected: `# fail 0`；`test:copy`（i18n parity + 裸汉字 + style token + lint）全绿。

- [ ] **Step 2: 构建 —— 验证 `useSearchParams` 不炸**

这是本轮唯一的真风险点。`useSearchParams()` 在静态预渲染时要求 Suspense 边界；`src/app/[locale]/(app)/layout.tsx` 第 1 行的 `export const dynamic = 'force-dynamic'` 是段级声明，理论上该 layout 下不会发生静态预渲染——**但这只是推导，必须实测**。

```bash
cd /Users/fengzhou/Code/newWith-nav && npm run build 2>&1 | tail -40
```

Expected: 构建成功，输出里**没有** `useSearchParams() should be wrapped in a suspense boundary` 或 `Missing Suspense boundary with useSearchParams`。

**如果炸了**：退到不依赖 `useSearchParams` 的实现——Sidebar 里用 `const [qs, setQs] = useState<URLSearchParams | null>(null)` + `useEffect(() => setQs(new URLSearchParams(window.location.search)), [path])`，把 `qs` 传给 `isNavActive`（它已经接受 `null` 并按默认值判定，首帧不会误亮）。`/tasks` 页面同理。改完回到 Step 1 重跑。

- [ ] **Step 3: 起本地 dev server**

worktree 不能用 `preview_start`（它跑的是主仓），手动起且换端口避开主仓的 3000：

```bash
cd /Users/fengzhou/Code/newWith-nav && npx next dev -p 3021
```

- [ ] **Step 4: 展开态人工回归**

浏览器开 `http://localhost:3021`，登录后逐项核对：

1. 一级入口正好 7 个，顺序是：工作台 / 创作者运营 / 团队协作 / 成本管理 / AI 助手 / 官网管理 / 系统设置
2. 每个 group 点标题能展开收起，刷新后展开状态保持
3. 逐个点开子项，确认每一项都跳到对的页面且自己高亮、兄弟项不高亮
4. 进 `/creators/<某个 id>` 详情页——按现有 `exact: true` 语义，「创作者列表」不高亮（**这是本轮之前就有的行为，不在本轮范围内，别顺手改**）

- [ ] **Step 5: `/tasks` 深链回归**（本轮核心新行为）

| 操作 | 期望 |
|---|---|
| 点侧栏「团队协作 → 人员任务与工时」 | URL 变 `/tasks?view=workload`，页面停在工时 tab，只有这一条高亮 |
| 点侧栏「AI 助手 → AI 任务」 | URL 变 `/tasks?view=ai`，页面**切到 AI 任务 tab**，只有这一条高亮 |
| 上一步之后再点「人员任务与工时」 | tab 切回工时（验证派生而非 useState 初值——若 tab 不动就是 Step 1 没改对） |
| 地址栏直接敲 `/tasks`（无 query） | 工时 tab，「人员任务与工时」高亮，「AI 任务」不高亮 |
| 地址栏敲 `/tasks?view=bogus` | 同上，回落到工时 |
| 页面内用 Tabs 组件切 tab | URL 跟着变，侧栏高亮跟着换，已加载的列表数据不丢 |
| 浏览器后退键 | 能在两个 tab 之间退回去 |

- [ ] **Step 6: 折叠态回归**

点侧栏左上角的收起箭头进图标模式：

1. 7 个一级图标，颜色按 Step 3 登记的色板
2. hover 每个 group 图标弹出 flyout，子项齐全、名字正确
3. flyout 里点子项能跳转，且当前页对应的子项在 flyout 里高亮
4. hover 工作台/系统设置这两个 leaf 图标，出现名字 tooltip
5. **重点**：在 `/tasks?view=ai` 上 hover「AI 助手」和「团队协作」两个 group，确认只有 AI 助手的 flyout 里「AI 任务」亮

- [ ] **Step 7: 移动端回归**

浏览器 devtools 切 375×812：

1. 右上角汉堡键出现，点开抽屉，7 个入口齐全
2. 抽屉打开时页面滚不动（**用真实滚轮事件验证，别用 `window.scrollTo` 或读 `scrollingElement`——那两个都会给假结论**，本仓踩过）
3. 点任一子项，抽屉自动关闭且完成跳转

- [ ] **Step 8: 三语回归**

侧栏底部切 EN / 日本語，确认：

1. 7 个一级入口和全部子项都有译文，没有任何 `nav.xxx` 裸 key 露出来
2. 长文案（如 `Team Collaboration`、`人員タスク・工数`）在 240px 宽的侧栏里不撑破布局——超长要么截断（`truncate` 已在）要么换行，不能横向溢出

- [ ] **Step 9: 关掉 dev server，确认工作区干净**

```bash
cd /Users/fengzhou/Code/newWith-nav && git status --short && git log --oneline origin/main..HEAD
```

Expected: `git status` 无输出；`git log` 列出 5 条提交（设计稿 + 4 个 Task）。

- [ ] **Step 10: 推分支开 PR**

```bash
cd /Users/fengzhou/Code/newWith-nav && git push -u origin feat/nav-ia-consolidation
```

然后开 PR（本仓约定：改动走 PR，不直连 main）：

```bash
cd /Users/fengzhou/Code/newWith-nav && gh pr create --base main --title "feat(nav): 导航按业务归属收拢成 7 个一级入口" --body "$(cat <<'BODY'
## 问题

侧边栏 11 个一级入口按模块堆叠而非业务归属，几处归属让人困惑：「流程管理」实际是创作者生命周期却和「创作者」分家；「团队（AI代理）」下面挂着真实公司的业务分工；「工作区」是 AI 对话但名字看不出来；官网内容、战略时间轴、任务挤在同一层没有主次。

## 改动

11 → 7 个一级入口：**工作台 / 创作者运营 / 团队协作 / 成本管理 / AI 助手 / 官网管理 / 系统设置**。

**路由 URL 一律不变**，只动导航分组、命名、色板和三语文案。没有新建页面，没有删除页面。

`/tasks` 那一页原本装着「人员工时」和「AI 任务」两个 tab、分属两条业务线，现在通过 URL query（`?view=workload|ai`）拆成两个导航入口，页面 tab 状态改由 URL 驱动。导航高亮和页面 tab 回退共用 `src/lib/nav/nav.ts` 里同一张 `QUERY_SPECS` 登记表。

顺带把导航的激活判定从 `Sidebar.tsx` 里抽进 `src/lib/nav/nav.ts` 并配单测——`/tasks` 出现两次之后，判定逻辑不再是一句 `startsWith` 能说清的事。pathname 匹配同时收紧成 `=== href || startsWith(href + '/')`（原先裸 `startsWith` 会让 `/team` 误亮在 `/teamfoo` 上；当前 NAV 里没有这种路由，属行为等价的加固）。

## 已知副作用

`sidebar:groups` 的 localStorage 会失效——分组 key 改名，老用户存的展开状态读不到对应 key，回退到「有激活子项就自动展开」。不报错，不做迁移。

## 验证

- `npm test` 全绿，新增 12 条 `src/lib/nav/nav.test.ts` 断言（已跑 4 条突变探针确认这些测试真的会杀：query 匹配失效 / 默认值兜底失效 / pathname 退回裸 startsWith / exact 被忽略）
- `npm run test:copy` 全绿（i18n 三语 parity + 裸汉字 + style token + lint）
- `npm run build` 通过 —— 确认新引入的 `useSearchParams()` 没有触发 Suspense 边界报错
- 人工回归：展开态 / 折叠态 flyout / 移动端抽屉 / `/tasks` 六种深链场景 / 三语切换

## 不在本轮范围

- 工作台的「我的待办」「异常提醒」（目前不存在，属新功能）
- 全站「创作者」术语改口径为「主播」
- `/creators` 的 `exact: true` 让详情页不高亮列表项（本轮之前就有的行为）

设计稿：`docs/superpowers/specs/2026-09-04-nav-ia-consolidation-design.md`
实现计划：`docs/superpowers/plans/2026-09-04-nav-ia-consolidation.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 11: 确认 CI**

```bash
cd /Users/fengzhou/Code/newWith-nav && gh pr checks --watch 2>&1 | tail -20
```

Expected: 全绿。红了就看具体 job 日志修，不要靠猜。
