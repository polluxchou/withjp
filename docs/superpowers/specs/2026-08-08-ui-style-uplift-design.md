# 界面风格提升 2026-08 — 设计文档

> 日期：2026-08-08
> 状态：已与用户逐节确认（4 节全过），待用户复核本文件
> 前置调研：`docs/records/2026-08-08-ui-style-research-progress.md`
> 参考 mockup：`.superpowers/brainstorm/11155-1786202469/content/fly-flavor-v3.html`（定稿版，本地保留，双击可开）
> **长期权威**：设计要素全集与组件长期契约在 `docs/design-system.md`——本 spec 是「这一轮改什么」的变更文档，取值与契约冲突时以 design-system.md 为准

## 1. 背景与目标

6 月「轻量化改版」两个月后，调研（12 页浏览器走查 + 78 文件全库审计）发现：改版后新增的约 131 个提交大多未跟随设计规范，token 体系事实性失效（rounded-card 使用率 1.4%、主色 token 覆盖 55%、focus ring 分裂 5 个家族），items/venue 模块仍是 slate+indigo 老皮肤，表格/表单无共享组件（20 种表头写法、153 个手写控件），图表无统一色板。用户对现状的定性：**组件风格像陈旧 CRM，点阵衬底低幼，要提升专业度**。

本期目标：

1. 全站迁移到新设计语言（见 §3，fly.io 气质），消灭两套皮肤并存
2. 重建 token 体系（CSS 变量载体）+ 补齐共享组件层，并用 CI 脚本防止再漂移
3. 清掉调研发现的细节毛边（裸 i18n key、状态 pill 不一致、时间轴布局碰撞、三态缺失等）

优先级（用户定）：**A 一致性（必须）> B 质感 > D 细节完成度 > C 密度效率**。

## 2. 已确认的设计决策

| 决策点 | 结论 |
|---|---|
| 视觉方向 | 保持 violet 主色不换向；在此基础上提升专业度 |
| 衬底 | 点阵退役；浅底 + 顶部淡紫光晕，最终演进为三层氛围渐变（fly.io 式） |
| 设计语言 | 两轮否决（fly.io 冷峻基础设施风、柔和中间态、Vercel/Stripe 冷峻风均落选）后，**fly.io 气质版胜出**（用户展示 fly.io Apps/Sprites/Billing 三页为参照） |
| 字体 | **全站统一非衬线**；fly.io 的衬线显示标题被明确否决，禁止中文衬线/非衬线混搭 |
| 侧栏图标 | **彩色图标 chip**（每菜单项一色），非单色 |
| venue 模块 | 页面 chrome 迁新语言；**2D/3D 画布内部的工程语义色不动** |
| workspace | 收敛进新语言（去私有字体族/底色/负 margin），聊天布局保留 |
| 暗色模式 | 本轮不做；token 全部落 CSS 变量为未来留接口 |
| 实施路线 | **方案 A「样板间先行」**：PR1 token+组件+支出管理页 → PR2 高频页 → PR3 孤岛+图表 → PR4 清扫上锁 |

## 3. 目标设计语言（fly.io 气质，规范化）

关键词：紫罗兰氛围底、白卡分层、彩色点睛、排版分层而非边框分格。

- **氛围底**：`bg-atmosphere` 工具类，三层极淡径向渐变（左上 violet 0.10 / 右上 pink 0.05 / 右下 violet 0.07）铺在 `#faf9fc` 画布上；单点定义于 globals.css，替代 `bg-texture`
- **中性色**：mauve（带紫调）灰阶替代 zinc/slate——文字 `#211c33 / #3d3654 / #6f6884 / #8d87a1` 四档；发丝线 `rgba(33,28,51, .05/.07/.09)` 三档；卡面纯白
- **卡片**：白卡 14px 圆角 + `shadow-card`（1px 发丝 + 24px 极淡紫晕投影）；区块卡头 = 紫晕小图标(24px, 7px 圆角) + 标题 + 发丝分隔线
- **按钮**：主 CTA 渐变药丸（135°，#7c3aed→#9333ea→#a855f7，全圆角）；次级紫晕软药丸（10% 紫底 + violet 文字）；ghost/danger 跟随 token
- **列表**：fly 式行列表——状态 dot（带 3px 同色晕圈）+ 主标题 + 灰色 meta 行（小图标 + 编号mono + 日期 + 类别），金额等宽数字右对齐，tinted 状态药丸，行 hover 极淡紫
- **表格**（密集数值场景）：发丝线分隔，表头 11.5px 弱化色，数值列 tabular-nums 右对齐
- **KPI**：分格统计带（一张卡内竖分隔），大数字 24px/700/-0.03em + 12px 灰标签 + tinted 趋势小药丸
- **状态汇总**：带计数的彩色描边药丸（全部 84 / 已付款 66 / 待付款 18 式）
- **排版**：字号阶梯与字重四档（400/500/600/700）以 `docs/design-system.md` §2 为准——页面标题 24px/700/-0.02em、区块标题 15px/600、正文 13px、meta 12px、micro 11px；金额/编号用等宽（SF Mono 栈）+ tabular-nums；**全站非衬线**
- **色彩纪律**：violet 只出现在主 CTA、激活指示、图表主系列、图标点睛；状态色只以 9%-12% tinted 底或 dot 出现；大面积彩色填充禁止

## 4. Token 体系

**载体**：`globals.css` 的 `:root` CSS 变量 + tailwind.config.ts 映射（`rgb(var(--x) / <alpha-value>)` 写法保透明度修饰符），未来暗色 = 换一套变量值。完整取值表（含 z-index 层级、动效、图标、间距规范）在 `docs/design-system.md` §1-§5。

| 组 | 内容 |
|---|---|
| 中性 | `ink-900/700/500/400`（文字四档）、`line-soft/DEFAULT/strong`（发丝线三档）、`surface`、`canvas` |
| 品牌 | `primary` #7c3aed、`primary-hover` #6d28d9、`primary-soft`(10%)、`primary-soft-hover`(14%)、`primary-ring`、`primary-border`、`bg-primary-gradient`（仅主 CTA） |
| 语义 | success/warning/danger/info × { text / soft 底 / dot } 三件套 |
| 侧栏 chip | 6 色专用组（violet/pink/blue/green/amber/mauve），仅限侧栏与区块卡头图标 |
| 圆角 | card 14px / field·chip 10px / 按钮 pill / 图标 chip 7px |
| 阴影 | `shadow-card`、`shadow-pop`（弹层） |
| 图表 | `src/lib/chart-theme.ts` 导出 `CHART_SERIES`（首位 #7c3aed）+ `AXIS/GRID/TOOLTIP` 常量（mauve 灰阶） |

**防漂移**：新增 `scripts/check-style-tokens.mjs` 挂进 `npm run test:copy`——扫 src 下 `slate-`/`indigo-`/`zinc-`/裸 hex（chart-theme 等白名单除外）。「对新代码生效」的机制 = 基线清单：PR1 时记录存量违规（文件×计数）存入脚本旁的 baseline.json，之后任何 PR 违规数只许减不许增；PR4 存量清零后删除基线，转为零容忍硬门禁。

> **状态（2026-08-11，PR4 Task 6 已落地）**：基线机制按上述计划退役——`scripts/style-tokens-baseline.json` 已删除，`--update-baseline` / `--allow-increase` 已从脚本移除，门禁转为零容忍。清零后剩余例外收进脚本 `WHITELIST`（venue 2D/3D 画布的工程制图色、登录页营销位，另有 chart-theme / globals.css 两处 token 定义处），单行例外仍走 `style-tokens-ignore`。白名单只豁免禁用样式扫描，正向 token 校验（#157）对全库生效。权威表述见 `docs/design-system.md` §7.1。

旧 token 处理：`bg-canvas`/`rounded-card`/`shadow-card` 等重定义为新值（旧代码部分自动继承）；`bg-texture`/`sidebar-frosted` 在 PR3 后删除。

## 5. 组件规范

位置统一 `src/components/ui/`。**新建 9、改造 4、升级 3**。本节是本轮改造范围清单；组件的长期契约（完整 props、选型决策表、状态枚举→tone 映射、可访问性底线、页面模式）以 `docs/design-system.md` §6 为权威。

### 5.1 新建

| 组件 | API 要点 | 收编对象 |
|---|---|---|
| `SectionCard` | `icon` `title` `actions` `footer` `padding`(默认/none) | 61 处手写卡片容器 |
| `Tag` | `tone` × `variant`(soft/dot) × `size` | 6 份状态色映射、Badge 8 处调用 |
| `Stat` / `StatBand` | `label` `value` `delta` `note` `tone` | 4 套 KPI 写法 |
| `Table/THead/Th/Tr/Td` | `Th` 带 `align/width`；密集数值表用 | 14 表格 20 种 th |
| `RecordRow` | `status` `title` `meta[]` `amount` `tags` `who` `actions` | 支出/创作者/任务主列表 |
| `Field`+`Input/Select/Textarea/SearchInput` | `Field` 管 label/hint/error；控件 10px 圆角 + `primary-ring`；SearchInput 可带 ⌘K 角标 | 153 个手写控件、6 份私有常量 |
| `FilterChip` | 未设置(虚线)/已设置(实底+✕)；另有 `count` 变体 = 带计数的状态汇总药丸（「全部 84」式，可点击筛选） | 各页筛选行、列表页状态汇总 |
| `Tabs` / `SegmentedControl` | 下划线+violet 指示线 / 灰底白块 | 5 种 tab idiom |
| `ProgressBar` | `value/max` `tone` | 财务预测、预算卡 |

### 5.2 改造

- `Button`：primary→渐变药丸、secondary→紫晕软药丸、ghost/danger 跟 token、`icon` slot；44 处裸按钮分批迁入
- `Sidebar`：彩色图标 chip、紫晕药丸激活态、⌘K 样式工作区头、mauve 分组标签；磨砂退役
- `Header → PageHeader`：加 `tabs`、`search` slot；问候语仅仪表盘保留
- `CommandBar`：入口与交互不变（不动导航结构），仅换皮

### 5.3 升级（API 不变）

- `Modal`：14px 圆角 + `shadow-pop` + SectionCard 式卡头；8 处手写 modal 迁入（一并解决 z-index 倒挂、Escape/portal/safe-area 缺失）
- `EmptyState`：图标圈 + 标题 + hint + action（大 emoji 退役）
- 新增 `LoadingState`（含列表/统计带骨架变体）与 `ErrorState`（标题+说明+重试）；19 处文字加载态收编

## 6. 页面迁移映射

### PR1 · 样板间（合并即全站换底换侧栏 + 一页完整新语言）
- 全局：layout 换 `bg-atmosphere`；Sidebar 改造
- token 体系 + 组件库 v1 + `check-style-tokens`（新代码生效）
- `docs/design-system.md` 入库，并随样板间实现校准（mockup→代码的取值修正回写该文件）
- **支出管理**全迁：PageHeader+Tabs、状态汇总药丸、StatBand、RecordRow、FilterChip、3 图表接 chart-theme、两弹窗迁 Modal+Field —— 组件 API 在此页定型

### PR2 · 高频页（六处）
- 仪表盘：StatBand、漏斗/最近任务/最近创作者→SectionCard+RecordRow
- 创作者列表+详情：RecordRow+Tag，详情 4 处手写空态→EmptyState
- 流程管理：看板列头 Tag 统一（修「已互动/已解约」裸文本），规则卡→SectionCard
- 任务中心：Tabs+SegmentedControl、日期框换皮、StatBand、抽屉→Modal
- 战略时间轴：Tabs、FilterChip、**修三处布局碰撞**、图表接 chart-theme
- 团队三页：agent 卡→SectionCard（schema 收折叠）、业务分工行→Table 原语、负责人对比度修复

### PR3 · 孤岛消除 + 图表统一
- 物品管理：slate/indigo 清零、Table 原语、修裸 key、两弹窗迁 Modal
- 场地布置：chrome 全迁（ToolbarButton/LayerButton 退役），**画布语义色不动**
- workspace：去私有皮肤，部门色板入 token，布局保留
- 全部 recharts 接 chart-theme（修同色 bug、slate hex 清零）
- 知识库 + 配置顺路迁完

### PR4 · 细节清扫 + 上锁
- 裸 i18n key 全扫（含侧栏 `roles.tech`）、focus ring 收口、状态色映射复制删除、手写 modal 核查归零
- `check-style-tokens` 全量启用转 CI 硬门禁

### 不动的
登录页（独立营销位）、venue 画布内部、devices（redirect）、competitors（空目录）、导航信息架构、业务逻辑/API/数据库。

## 7. 细节修复验收清单

1. 状态展示唯一化：全站状态一律 `Tag`，裸文本状态清零（PR2）
2. 时间轴三处布局碰撞修复：节点卡重叠、左端日期截断、右端 +30天 换行（PR2）
3. 裸 i18n key 清零：`items.stat*`、`roles.tech`、config "Loading..."（PR3/4）
4. 图表：同色 bug 修复、图表紫=UI 紫同值、灰阶统一 mauve（PR1/3）
5. 三态补全：主要页面 LoadingState/EmptyState/ErrorState 齐备，「HTTP 503」裸文案退役（PR1-3 随页面走）
6. focus ring 全站一种；原生 date/select 换皮；iOS 16px 防缩放保留
7. 手写 modal 8 处归零（PR2/3）

## 8. 验证与交付纪律

- 每 PR：全部单测 + `test:copy` 绿；`check-style-tokens` 按节奏升级
- 每 PR：预览面板逐页走查，改前/改后截图贴 PR 描述，用户在真实环境验收
- 三语抽查：zh 全量、ja 重点看长词截断（6 月遗留风险）、en 抽查
- 无新依赖、纯样式与组件重构，bundle 无可感知增长；每 PR 独立可 revert
- 功能分支 + PR，不直推 main；独立 worktree 施工，不碰共享工作区

## 9. 非目标

- 不做暗色模式（只留 CSS 变量接口）
- 不动业务逻辑、API、数据库、导航信息架构
- 不做移动端专项（沿用现有响应式行为，PR 走查中顺手核对不新增破坏）
- 不做主播专区 Creator Portal（另立项目；本期 token 架构为其复用基础）

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| mockup→真实代码有落差（真实数据更杂、i18n 文案更长） | 方案 A 的核心用意：落差集中在 PR1 样板间一页内暴露并修正，组件 API 定型后再铺开 |
| PR1-PR3 期间新旧混杂 | 换底+侧栏先行让全站第一眼统一；白卡+边框旧样式在氛围底上视觉兼容，混杂期可接受 |
| venue chrome 与画布的边界判断有灰区（如浮动面板内嵌的画布控件） | 判断标准写死：「渲染在 canvas/SVG 内的 = 语义色不动；DOM 面板里的 = chrome 全迁」；拿不准的在 PR3 里单独列出截图问用户 |
| ja 长词在新紧凑组件里截断 | 组件一律 `min-w-0` + truncate 显式处理；ja 抽查进每 PR 验收 |
| 巨型文件（guild-venue 2152 行等）改造回归风险 | 只动样式层不动逻辑；venue 有 layout-sync/translate 单测兜底；PR3 单独走查 3D/2D 交互 |
