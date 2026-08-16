# 竞品监测：追踪账号统计条 + 名称快速导航

日期：2026-08-15
分支：`feat/competitor-board-summary-nav`

## 问题

竞品监测页（`/[locale]/(app)/competitors`）目前是一条竖排的竞品卡列表，顶部只有「添加竞品」输入框和一条全局截图日期轴。两个缺口：

1. **没有总览**。追踪了多少个账号、粉丝盘子多大、数据是不是还在更新，都得一张张卡片翻着看。
2. **没有定位手段**。账号一多就只能一路滚，想看某个特定竞品没有捷径。

## 目标

在卡片列表上方补一条统计条和一条名称导航条。统计口径与导航范围**只覆盖顶层主竞品**（`parent_id` 为 null 的团播主账号），下钻的子主播不参与——它们是父卡内部的下钻内容，混进总量会让「追踪了几家」这个数字失去意义。

不改数据库、不改 API、不新增查询：所有数字都从 `getCompetitorBoard` 已经返回的 `CompetitorBoard` 现算。

## 一、统计口径

新建纯函数模块 `src/lib/competitors/summary.ts`，与 `metrics.ts` / `weekly.ts` / `shotGrid.ts` 同级——零 IO、零时钟，可单测。

```ts
export const STALE_DAYS = 7

export interface BoardSummary {
  tracked: number            // 主竞品账号数
  withData: number           // latest 存在且 followers 非空的账号数
  totalFollowers: number     // 上述账号 latest.followers 求和
  latestCapturedOn: string | null  // 全体 latest.captured_on 的最大值
  staleCount: number         // 陈旧账号数
  staleNames: string[]       // 陈旧账号显示名，按输入顺序
  daysSinceLatest: number | null   // latestCapturedOn 距 today 的天数
}

export function summarizeBoard(
  competitors: CompetitorWithHistory[],
  today: string,          // YYYY-MM-DD，调用方注入（用 todayLocal()）
): BoardSummary
```

规则：

- **今天不读时钟**。`today` 由调用方从 `localDate.ts` 的 `todayLocal()` 传入，函数本身保持纯净可测。
- **陈旧判定**：`latest` 为 null（从没采集过）→ 陈旧；否则 `today - captured_on > STALE_DAYS` → 陈旧。正好等于 7 天不算陈旧。
- **日期差算法**：`YYYY-MM-DD` 直接 `Date.UTC` 解析后相减取整天，不经过本地时区，避免夏令时/时区偏移产生 ±1 天。
- **`totalFollowers` 跳过 null**：`withData` 同时暴露参与求和的账号数，界面用它说明这个总量的覆盖面，不让人误以为是全量。
- **显示名**：`latest?.display_name ?? display_name ?? handle`，与卡片一致。抽成导出的 `competitorName(c)` 供统计条、导航条、卡片共用。
- **空数组**：`tracked: 0`、`totalFollowers: 0`、`latestCapturedOn: null`、`staleNames: []`。

## 二、统计条组件

`src/components/competitors/CompetitorSummaryBar.tsx`，用现成的 `StatBand` + `Stat`（`@/components/ui/Stat`）。四格：

| 格 | value | note |
|---|---|---|
| 追踪账号 | `tracked` | `withData < tracked` 时显示「N 个有粉丝数据」，否则不显示 |
| 粉丝总量 | `formatCount(totalFollowers)` | 「基于 N 个账号最新快照」 |
| 最近采集 | `latestCapturedOn ?? '—'` | `daysSinceLatest` → 「今天 / N 天前」 |
| 待更新 | `staleCount` | 前两个陈旧账号名，超出补「等 N 个」；为 0 时显示「全部 7 天内」 |

「待更新」在 `staleCount > 0` 时传 `tone="danger"` 走红色数字。数字走 `Stat` 内置的 `tabular-nums`。`tracked === 0` 时整条不渲染（页面已有 `empty` 空态文案）。

## 三、导航条组件

`src/components/competitors/CompetitorNavBar.tsx`：

- 左侧一个窄输入框（复用 `@/components/ui/Field` 的 `Input`），右侧横向可滚动的账号名芯片行。
- **过滤**：对显示名与 `handle` 做大小写不敏感子串匹配，只过滤芯片，卡片列表不受影响。
- **点击芯片**：`document.getElementById('competitor-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`，同时把该 id 交给父组件作为高亮目标。
- **高亮**：目标卡片挂 `ring-2 ring-primary-ring` 1.6 秒后自动消失，让人知道滚动停在了哪张卡。定时器在组件卸载与目标变更时清理。
- **不渲染条件**：主竞品少于 2 个（1 个时导航没有意义）。
- **无命中**：过滤后 0 个芯片时显示一行「无匹配」小字。
- 芯片是真正的 `<button>`，带 `FOCUS_RING`，键盘可 Tab 可达。

## 四、卡片与视图改动

- `CompetitorCard`：顶层卡（`nested === false`）的根节点加 `id={'competitor-' + c.id}` 和 `scroll-mt-4`（抵消滚动定位时贴顶过紧），并接收新的 `highlighted?: boolean` prop 决定是否挂高亮 ring。子卡不参与，保持现状。
- `CompetitorDossierView`：新增 `highlightId` state 与 1.6 秒定时器；渲染顺序为 添加框 → 统计条 → 导航条 → 截图日期轴 → 卡片列表。

## 五、i18n

`messages/{zh,en,ja}.json` 的 `competitors` 命名空间新增，三语同步：

`statTracked` / `statTrackedNote` / `statFollowers` / `statFollowersNote` / `statLatest` / `statLatestToday` / `statLatestDaysAgo` / `statStale` / `statStaleNone` / `statStaleNames` / `statStaleMore` / `navFilterPlaceholder` / `navNoMatch` / `navJumpTo`（芯片 aria-label）。

带数字的走 ICU 占位符（`{count}` / `{names}`），不拼字符串。

## 六、测试

`src/lib/competitors/summary.test.ts`（`node --test`，需同步登记进 `package.json` 的 `test` 脚本文件列表）：

- 空数组 → 全零 / null。
- 全部有数据 → `totalFollowers` 正确求和，`withData === tracked`。
- 部分 `latest` 为 null 或 `followers` 为 null → 跳过求和，`withData` 少计，且 null-latest 计入陈旧。
- `latestCapturedOn` 取最大值（乱序输入）。
- 陈旧边界：距今正好 7 天不算陈旧，8 天算。
- 跨月/跨年日期差正确（如 2026-01-01 与 2025-12-30）。
- `competitorName` 三级回退顺序。

## 七、验证与交付

- `npm test`、`npm run test:copy`（i18n / 无裸中文 / style token / lint）全绿。
- 本地起 worktree 专用端口跑一次真实页面：确认统计数字、芯片过滤、滚动定位与高亮。
- 用户可感知的新功能 → 追加 `src/lib/changelog/entries.ts` 条目。
- 从 `origin/main` 开分支走 PR，不直推 main。
