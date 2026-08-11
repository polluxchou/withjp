# 竞品监测图片日期列对齐 — 设计

日期：2026-08-10
分支：`feat/competitor-shot-date-columns`

## 问题

竞品监测页每个竞品卡片里的截图相册（`ShotAlbum`）用 `flex-wrap` 自由排布，展开后按 ISO 周分组。不同竞品之间没有任何共享的横向坐标：A 竞品的第 3 张图和 B 竞品的第 3 张图可能相隔两周。想横向对比"同一天各家在播什么"做不到。

## 目标

在相册上引入**日期列**：整页共用一条日期轴，每个竞品占一行，竖着看一列就是同一天的不同竞品。选中某一天时定位并高亮该列。缺图的格子留占位，保证行永远对得齐。

## 非目标

- 不改竞品卡片的展开详情、粉丝曲线、父子下钻等既有交互
- 不改 `weekly.ts` / `WeeklyFollowersCurve`（周聚合曲线继续按周，与相册日期轴无关）
- 不做日期区间筛选、不做跨竞品的图片批量操作

## 已确定的产品决策

| 决策点 | 结论 |
|---|---|
| 对齐范围 | 跨竞品行对齐，整页共用一条日期轴 |
| 落地位置 | 保留现有卡片布局，卡内相册改用全局日期列 |
| 选中行为 | 定位并高亮该列，前后几天仍可见可翻 |
| 日期轴构成 | 所有竞品有图日期的并集（非连续日历日） |
| 一格多图 | 封面 + `+N` 角标，点开看当天全部 |
| 日期可编辑 | 上传时可选（默认今天）+ 事后可改 |
| 窗口宽度 | 5 列 |
| 子主播卡对齐 | 取消缩进并统一列宽，与顶层卡严格对齐 |

## 方案选择

三种实现路径都能画出日期列，区别在于"对齐"这个核心保证由什么来维持：

1. **页面级日期窗口（采纳）** — 页面持有一个固定宽度的窗口，所有相册只渲染窗口内那几列。列集合和列宽由同一份 state 决定，对齐是结构性质，不存在运行时同步。代价是一次看不到全部历史，需要翻页。
2. 各卡独立横滚 + `scrollLeft` 同步 — 手感接近无限时间轴，但对齐靠运行时同步维持：惯性滚动、触控板、`onScroll` 事件回环、卡片宽度差异都会打破它。恰恰破坏了本需求的核心诉求。
3. 整个卡片列表套一个横滚容器 — 对齐最强，但横滚时头像、名字、粉丝曲线一并移出视野，阅读体验差。

采纳方案 1。

## 架构

### 新增纯函数模块 `src/lib/competitors/shotGrid.ts`

沿用 `weekly.ts` / `chart.ts` / `assemble.ts` 的既有模式：纯函数 + 同名 `.test.ts`。

```ts
/** 无日期图片在轴上的占位键。 */
export const UNDATED_KEY = '—'

/** 递归收集所有竞品（含 related 子主播）有图的日期，升序去重；存在无日期图时末尾追加 UNDATED_KEY。 */
export function collectShotDates(competitors: CompetitorWithHistory[]): string[]

/**
 * 以 anchorIndex 为中心取 size 列，夹逼到 [0, axis.length)。
 * 靠边时向另一侧补足，仍尽量取满 size 列。
 * anchorIndex 为 -1（anchorDate 不在轴上）时按贴右处理，即取轴末尾 size 列。
 */
export function windowOf(axis: string[], anchorIndex: number, size: number): string[]

/** 按日期归组；shot_on 为 null 归入 UNDATED_KEY。组内按 sort_order 再 created_at 升序，首张为封面。 */
export function groupShotsByDate(shots: CompetitorShot[]): Map<string, CompetitorShot[]>
```

日期轴升序（左旧右新），与横向时间轴的常规阅读方向一致。`UNDATED_KEY` 固定排在末尾，复用现有的 `t('undated')` 文案。

### state 归属

`CompetitorDossierView` 持有 `anchorDate: string | null`，默认为轴上最新的一天（即窗口贴右）。用 `useMemo` 从 `board.competitors` 算出 `axis`，再算出 `dateWindow: string[]`。

`dateWindow` 和 `selectedDate` 作为 props 逐层下传：`CompetitorDossierView` → `CompetitorCard` → `ShotAlbum`。`CompetitorCard` 只透传，递归渲染 `related` 子卡时原样下发。

不引入 React Context：树深只有两层，显式 props 更容易测，也和 `CompetitorCard` 现有的 props 风格一致。

### 新增组件 `src/components/competitors/ShotDateStrip.tsx`

页面级日期条，渲染在竞品卡片列表上方：

- 窗口内 5 个日期 chip，当前 `anchorDate` 高亮
- 左右箭头各翻 1 列；到轴端点时禁用
- 点某个 chip 即设为 `anchorDate`
- 轴为空时整条不渲染

### `ShotAlbum` 重构

原有的 `flex-wrap` 排布、`weekStartOf` 按周分组、`viewAll` / `collapse` 折叠三段逻辑全部由日期网格取代。`weekStartOf` 在本文件的引用消失，但 `src/lib/competitors/weekly.ts` 仍被 `WeeklyFollowersCurve` 使用，不删除。

新增 props：`dateWindow: string[]`、`selectedDate: string | null`。

渲染为 `grid-template-columns: repeat(N, minmax(0, 1fr))`，`N = dateWindow.length`。每格：

- 有图 → 封面缩略图；该日多于一张时右上角 `+N` 角标（`N = 张数 - 1`）
- 无图 → 虚线空占位，保持与缩略图相同高度，行高不塌
- 该列为 `selectedDate` → 整列描边高亮

点击格子打开当天灯箱。

### 上传入口移位

`ShotUploader` 现在是 flex 里与缩略图并排的同级 item。日期网格下它不能占据一列——占了就破坏列对齐。移到相册区标题行（日期条右侧），不参与网格。

同时给它加一个 `<input type="date">`，默认今天。现有实现在 `ShotUploader.tsx` 里硬编码 `shot_on = 今天`；日期成为主轴后，这个默认值会把补传的历史截图全挤进今天那一列。

### 删除入口移位

现在删除按钮在每张缩略图右上角。封面出现 `+N` 角标后，"删除封面那张"语义模糊且容易误删。改为：格子只负责打开灯箱，删除移进灯箱、只删当前正在查看的那张。

### 灯箱升级

从单图查看升级为当天图集：

- 左右切换当天该竞品的多张图，显示 `2 / 3` 计数
- `canEdit` 时提供日期编辑（`<input type="date">`）和删除
- 保留点击遮罩关闭

### 子主播卡对齐修正

[`CompetitorCard.tsx`](../../../src/components/competitors/CompetitorCard.tsx) 现有布局有两处会打破跨行对齐：

1. 顶层卡用 `grid-cols-[1fr_3fr]`（曲线 1 份、相册 3 份），`nested` 子主播卡却用 `space-y-2` 竖排、相册占满宽 — 相册左起点和宽度都不同
2. `related` 区块外面套着 `border-l-2 border-zinc-100 pl-3` 缩进，又平移了一段

修正：子卡改用与顶层卡相同的 `grid-cols-[1fr_3fr]`，去掉 `border-l-2 pl-3` 缩进。层级感改由子卡已有的 `bg-zinc-50` 底色承担。

### 后端改动

`PATCH /api/competitors/shots/[shotId]`（body `{ shot_on?, tag?, caption?, sort_order? }`）与 `service.updateShot` **均已存在**，前端可直接调用，无需新增路由。

唯一缺口是校验：现有 `updateShot` 把 `shot_on` 原样透给数据库（`service.ts:188-200`），格式非法时由 Postgres 的 `date` 列报错，经 `db_error` 映射成 500，而语义上应是 400。

补法：在 `shotGrid.ts` 里导出纯函数 `isValidShotDate(value: unknown): boolean`（接受 `null` 或 `YYYY-MM-DD` 且为真实存在的日历日），在 `updateShot` 和 `addShot` 里前置校验，非法返回 `invalid_input`。校验逻辑放纯函数模块而非 `service.ts`，是因为 `service.ts` 依赖 `createServerClient()`、无法脱离数据库做单测。

**无需数据库迁移** — `competitor_shots.shot_on` 字段已存在（`043_competitor_dossier.sql:21`，且 `(competitor_id, shot_on)` 上已有索引）。

## 数据流

```
getCompetitorBoard (server)
  → board.competitors[]  (每个含 shots[] 与 related[])
    → CompetitorDossierView
        axis        = collectShotDates(board.competitors)
        anchorDate  = 用户选择，默认 axis 末位有效日期
        dateWindow  = windowOf(axis, indexOf(anchorDate), 5)
        → ShotDateStrip  (读 axis / anchorDate，写 anchorDate)
        → CompetitorCard (透传 dateWindow / selectedDate)
            → ShotAlbum
                grouped = groupShotsByDate(c.shots)
                for each date of dateWindow → 封面格 或 空占位格
```

写操作（上传 / 改日期 / 删除）走既有的 `onChanged` → `refresh()` 全量重取，轴与窗口随之重算。

## 边界情况

| 情况 | 处理 |
|---|---|
| 全站一张图都没有（轴为空） | 不渲染 `ShotDateStrip`；相册回落到现有 `t('noShots')` 与上传入口 |
| 轴不足 5 天 | 列数 = 轴长度，不补空列 |
| 某竞品在窗口内全无图 | 该行 5 个虚线占位，行高不塌 |
| `shot_on = null` 的历史数据 | 归入轴末尾的 `UNDATED_KEY` 列，标题显示 `t('undated')` |
| 新传图的日期不在轴上 | `refresh()` 后轴重算，`anchorDate` 跟到该天 |
| 改日期导致某列变空并从轴上消失 | 轴重算；若消失的正是 `anchorDate`，回落到轴上日历距离最近的日期，并列时取较新的一天 |
| 同一天同一竞品图片数为 1 | 不显示 `+N` 角标 |

## 错误处理

- `PATCH` 失败：灯箱内红字提示（沿用 `t('actionFailed')`），保留原日期不刷新，用户可重试
- 日期格式非法：前端 `<input type="date">` 自身约束 + 提交前校验，非法时禁用保存按钮
- 后端 `updateShot` / `addShot` 用 `isValidShotDate` 独立再校验一次，非法返回 `invalid_input`（400），避免落到 Postgres 报错后被映射成 500
- 删除失败：沿用现有行为（静默保留原状，用户可重试）

## 测试

新增 `src/lib/competitors/shotGrid.test.ts`：

- `collectShotDates` — `related` 子主播递归收集、跨竞品去重、升序、存在无日期图时末尾追加 `UNDATED_KEY`、全空返回 `[]`
- `windowOf` — anchor 居中、贴左边界、贴右边界、轴长度短于 size、size 为 0
- `groupShotsByDate` — 组内按 `sort_order` 再 `created_at` 排序、`shot_on` 为 null 归入 `UNDATED_KEY`、空输入

- `isValidShotDate` — 合法 `YYYY-MM-DD`、`null`、空串、`2026-13-01` 等越界月日、`2026-2-3` 等非补零写法、非字符串类型

`src/lib/competitors/` 下现有 5 个测试文件（`metrics` / `chart` / `assemble` / `weekly` / `mentions`）均只测纯函数；`service.ts` 因依赖 `createServerClient()` 无对应单测，本轮沿用该边界，不为其新建测试。

**注意**：新测试文件必须手动加入 `package.json` 的 `test` 脚本文件列表，否则不会被执行。

## 仓库闸门约束

三个 `npm run test:copy` 闸门会直接影响本轮的写法：

1. **`check-style-tokens.mjs`** — `zinc-*` / `gray-*` / 裸 hex 等属禁用样式，走基线机制：每个文件的违规数不得超过 `scripts/style-tokens-baseline.json` 里的记录。现有基线为 `CompetitorCard.tsx: 33`、`CompetitorDossierView.tsx: 7`、`ShotAlbum.tsx: 3`、`ShotUploader.tsx: 3`。新建的 `ShotDateStrip.tsx` 不在基线里，**任何一处违规即致命**，必须全程用语义 token。
2. **正向 token 校验（致命，不走基线）** — 类名里的色阶必须真实登记于 `tailwind.config.ts`，否则 Tailwind 不生成该类、样式静默失效。已登记的灰阶只有 `ink-900 / ink-700 / ink-500 / ink-400`——**没有 `ink-600`**；边框用 `line-soft / line / line-strong`，背景用 `canvas / surface`，弱化文字用 `muted-text`，强调色用 `primary` 系。禁止给 `primary-soft`、`line` 这类固定值 token 加 `/50` 透明度修饰符（会静默失效）。
3. **`check-no-bare-han.mjs`** — JSX 里不允许出现裸中文（children、属性字符串、模板字面量都查），允许名单已清空。所有新文案必须走 `useTranslations()` 并同步补齐 `messages/{en,zh,ja}.json` 三个文件。

## 影响面

| 文件 | 改动 |
|---|---|
| `src/lib/competitors/shotGrid.ts` | 新增 |
| `src/lib/competitors/shotGrid.test.ts` | 新增 |
| `src/components/competitors/ShotDateStrip.tsx` | 新增 |
| `src/components/competitors/ShotAlbum.tsx` | 重构为日期网格 |
| `src/components/competitors/ShotUploader.tsx` | 移位 + 日期输入 |
| `src/components/competitors/CompetitorCard.tsx` | 透传 props + 子卡对齐修正 |
| `src/components/competitors/CompetitorDossierView.tsx` | 持有 anchorDate + 渲染日期条 |
| `src/lib/competitors/service.ts` | `addShot` / `updateShot` 前置日期校验 |
| `src/app/api/competitors/shots/[shotId]/route.ts` | 无需改动（`PATCH` 已存在） |
| `package.json` | `test` 脚本追加 `shotGrid.test.ts` |
| `messages/{en,zh,ja}.json` | `competitors` 命名空间补文案；删除该命名空间下的 `viewAll` / `collapse`（已确认仅被 `ShotAlbum.tsx:120` 引用，与 sidebar 的 `collapse`、首页的 `viewAll` 是不同命名空间，不受影响） |
