# 内部后台导航信息架构重组

日期：2026-09-04
分支：`feat/nav-ia-consolidation`

## 问题

侧边栏有 11 个一级入口，按模块堆叠而非按业务归属组织，几处归属让人困惑：

- 「流程管理」实际是创作者生命周期看板，却和「创作者」分成两个一级入口。
- 「团队（AI代理）」这个一级入口下面挂着「业务分工」——那是真实公司的人员分工，不是 AI 代理的。
- 「工作区」是 AI 对话界面，名字看不出用途。
- 官网内容、战略时间轴、任务处在同一层，没有使用频率上的主次。

## 范围

**本轮只做导航信息架构（分组、命名、色板、三语文案），不动路由 URL、不新建页面。**

明确排除（下一轮或不做）：

- 工作台的「我的待办」「异常提醒」——目前不存在，属新功能，涉及数据口径和通知，单独一轮。
- 全站「创作者」术语改口径为「主播」——本轮沿用现有术语「创作者」。
- 任何 URL 变更与 redirect。

## 目标结构

7 个一级入口（原 11 个）：

| # | 一级入口 | key | 子项 | 路由 |
|---|---|---|---|---|
| ① | 工作台 | `workbench` | —（leaf） | `/` |
| ② | 创作者运营 | `creatorOps` | 官网应募 | `/recruit-applications` |
| | | | 创作者列表 | `/creators` |
| | | | 生命周期看板 | `/pipeline` |
| | | | 竞品监测 | `/competitors` |
| ③ | 团队协作 | `teamwork` | 人员任务与工时 | `/tasks?view=workload` |
| | | | 战略里程碑 | `/timeline` |
| | | | 业务分工 | `/team/org` |
| ④ | 成本管理 | `costManagement` | 支出管理 | `/expenses` |
| | | | 物品资产 | `/items` |
| | | | 场地布置 | `/guild-venue` |
| | | | 财务预测 | `/finance-forecast` |
| ⑤ | AI 助手 | `aiAssistant` | AI 对话 | `/workspace` |
| | | | AI 任务 | `/tasks?view=ai` |
| | | | 代理任务分配 | `/team/assignments` |
| | | | 代理配置 | `/team` |
| | | | 知识库 | `/knowledge` |
| ⑥ | 官网管理 | `siteContent` | 新闻管理 | `/site-content/news` |
| | | | 成员管理 | `/site-content/members` |
| ⑦ | 系统设置 | `settings` | —（leaf） | `/config` |

改名对照（仅导航文案，页面内部标题本轮不动）：

| 原 | 新 |
|---|---|
| 仪表盘 | 工作台 |
| 创作者（一级） | 创作者运营 |
| 流程管理 | 生命周期看板（移入创作者运营） |
| 战略时间轴 | 战略里程碑（移入团队协作） |
| 任务 | 拆成「人员任务与工时」+「AI 任务」两个入口 |
| 工作区 | AI 对话 |
| 团队（AI代理） | AI 助手（一级）／代理配置（子项） |
| 任务分配 | 代理任务分配 |
| 知识库（一级） | 知识库（移入 AI 助手） |
| 配置 | 系统设置 |

「系统设置」只有 `/config` 一个页面（`/config/changelog` 是它的子页），保持 leaf 而不是只装一项的分组。

## 关键设计决策

### 1. `/tasks` 一页两 tab 用 query 深链拆成两个入口

`/tasks` 现在是一个页面两个 tab：`workload`（人员工时 + 薪资管理，默认）和 `ai`（AI 任务）。新结构要把它们分到「团队协作」和「AI 助手」两个一级入口下。

**采用**：把 tab 状态接到 URL query（`?view=workload` / `?view=ai`），页面不拆。

理由：改动最小，老书签仍可用，两个导航入口能各自独立高亮。备选的「真拆成两个路由」要动页面代码和组件边界，收益不抵成本；备选的「不拆，AI 助手下只放 `/team/assignments`」会让 `/tasks` 的 AI tab 失去直达入口。

### 2. 导航定义从组件里抽出来

`NAV` 常量和 `isActive` 判定现在埋在 490 行的 `Sidebar.tsx` 里，没有测试覆盖。本轮引入 query 参与 active 判定，逻辑会更绕。

**采用**：抽到 `src/lib/nav/nav.ts`，导出 `NAV`、`NAV_ACCENT`、`accentOf`、`isNavActive`，配单测。对齐官网侧 `src/lib/site/nav.ts` 的既有做法（那边也是纯函数 + `nav.test.ts`）。

`Sidebar.tsx` 只保留渲染，不再持有结构定义。

### 3. 保留 `/team/assignments`

它和 `/tasks?view=ai` 内容有重叠（前者是按代理分组的只读看板，后者是可执行的任务列表），但从导航里删掉一个现有页面等于让人再也找不到它，是不可逆的感知变化。保留在 AI 助手下，命名「代理任务分配」。

## 实现要点

### `src/lib/nav/nav.ts`（新建）

类型扩展：`NavLeaf` 增加可选 `query?: Record<string, string>`。

```
type NavLeaf = {
  href: string
  key: string
  icon: LucideIcon
  exact?: boolean
  query?: Record<string, string>   // 新增
}
```

`isNavActive(pathname, searchParams, leaf)` 判定规则：

1. 先按现有规则匹配 pathname（`exact` 精确匹配，`/` 特判，否则 `startsWith`）。
2. pathname 不匹配 → false。
3. leaf 没有 `query` → true（现有行为不变）。
4. leaf 有 `query` → 逐个 key 比对当前 URL 的对应参数值；**参数缺失时按页面默认值兜底**，否则首次进 `/tasks`（无 query）两个入口都不高亮。

默认值在 `nav.ts` 里显式登记一张表，与 `/tasks` 页面 `mainTab` 的初值回退保持同一口径：

```
const QUERY_DEFAULTS: Record<string, Record<string, string>> = {
  '/tasks': { view: 'workload' },
}
```

单测覆盖：无 query 的 leaf 行为不回归、`?view=ai` 只高亮 AI 任务、`?view=workload` 只高亮人员任务、裸 `/tasks` 走默认值高亮人员任务、`exact` 语义、`/` 特判。

### `src/components/layout/Sidebar.tsx`

- 从 `@/lib/nav/nav` 导入 `NAV` / `accentOf` / `isNavActive`，删除本地定义。
- **React key 必须从 `item.href` 改成 `item.key`**：两个 leaf 都指向 `/tasks`，href 不再唯一（`renderLeaf`、`CollapsedNavGroup` 的 children map 两处）。
- `Link href` 带 query 的 leaf 要拼成 `` `${href}?${new URLSearchParams(query)}` ``。
- `isActive` 改调 `isNavActive`，需要 `useSearchParams()`。

**风险点**：`useSearchParams()` 在 App Router 里静态渲染时要求 Suspense 边界。Sidebar 在 `(app)/layout` 下，页面大多 `force-dynamic`，但**必须跑 `npm run build` 实测确认**，不能推断。若构建报错，退路是读 `window.location.search` + 客户端 state（首帧高亮延后一拍，可接受）。

### `src/app/[locale]/(app)/tasks/page.tsx`

- `mainTab` 初值从 `useSearchParams().get('view')` 读，非法值回退 `workload`。
- 切 tab 时 `router.replace` 回写 URL（用 `@/i18n/navigation` 的 router，保住 locale 前缀）。

### `src/lib/nav/nav.ts` 的 `NAV_ACCENT`

7 个一级入口从 §1.4 六色板取色（`design-system.md` 只要求「每个一级菜单固定一色」，未要求互不相同）：

```
workbench: mauve       creatorOps: pink       teamwork: blue
costManagement: green  aiAssistant: violet    siteContent: amber
settings: mauve
```

子项 accent 沿用现有登记（`expenses` violet、`items` amber、`venue` violet、`financeForecast` green、`teamOrg` green、`recruitApplications` pink、`teamAgents` violet、`teamAssignments` blue），新增子项不单独登记时继承父级。

`NAV_ACCENT` 的 `Record<TopNavKey, Accent>` 有编译期漏登记检查——一级菜单 key 改了却忘记登记色板会直接编译失败。

### `messages/{zh,en,ja}.json`

`nav` 命名空间三语同步。新增 key：`workbench`、`creatorOps`、`teamwork`、`aiAssistant`、`settings`、`aiChat`、`aiTasks`、`workTasks`、`lifecycleBoard`、`milestones`。移除或改写：`dashboard`、`creators`、`pipeline`、`timeline`、`tasks`、`workspace`、`team`、`config`。

`ja` 沿用既有的「ライバー」而非「クリエイター」（该 locale 现有约定）。

## 已知副作用

**`sidebar:groups` localStorage 失效**：分组 key 从 `creators`/`team` 改成 `creatorOps`/`teamwork` 等，老用户存的展开状态读不到对应 key，回退到「有激活子项就自动展开」的默认行为。不报错、不需要迁移，可接受。

## 验收

代码质检：

- `npm run test` —— 含新增的 `src/lib/nav/nav.test.ts`（**新测试文件必须登记进 `package.json` 的 `test` 脚本**，否则 CI 不跑）
- `npm run test:copy` —— i18n key parity（三语）、裸汉字、style token、lint
- `npm run build` —— 确认 `useSearchParams` 不炸构建

人工回归（本地 dev，worktree 需手动 `npx next dev -p <非 3000 端口>`）：

- 展开态：7 个一级入口顺序、分组展开收起、子项高亮
- 折叠态：一级图标 + hover flyout 子项列表、leaf 的 hover tooltip
- 移动端（375×812）：抽屉打开、滚动锁、点子项后自动关抽屉
- `/tasks` 深链：`?view=ai` 只高亮「AI 任务」、`?view=workload` 与裸 `/tasks` 只高亮「人员任务与工时」、页面内切 tab 时 URL 跟着变
- 三语切换后导航文案完整，无裸 key（`nav.xxx`）
