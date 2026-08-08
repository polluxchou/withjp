# Creator Guild OS 设计系统（权威参照）

> 建立：2026-08-08（界面风格提升轮，spec：`docs/superpowers/specs/2026-08-08-ui-style-uplift-design.md`）
> 地位：**全站 UI 的唯一权威**。任何新页面、新组件、新图表先读本文件；与旧代码冲突时以本文件为准。
> 维护：设计要素或组件契约变更，必须在同一个 PR 里更新本文件。参考实现见 `src/components/ui/` 与 `src/lib/chart-theme.ts`。

## 0. 设计原则

1. **氛围与分层**：紫罗兰氛围底 + 白卡分层。层级靠留白、发丝线、字重表达，不靠边框套边框。
2. **色彩纪律**：violet 只做点睛（主 CTA、激活指示、图表主系列、图标）；语义色只以 9%-12% tinted 底或 dot 出现；禁止大面积彩色填充。
3. **排版先行**：信息层级优先用字号/字重/灰度解决；数字一律 tabular，编号金额用等宽。
4. **统一非衬线**：全站禁止衬线字体（含中文宋体），禁止混搭。
5. **默认克制**：无入场动画、无厚投影、无高饱和；亲和感来自氛围底与彩色图标 chip，不来自圆角和 emoji。

## 1. 色彩

全部以 CSS 变量定义于 `globals.css`，Tailwind 经 `rgb(var(--x) / <alpha-value>)` 映射。**禁止**在业务代码出现 `slate-*` / `indigo-*` / `zinc-*` / `gray-*` / `stone-*` / `neutral-*` 等数字阶灰、裸 hex、固定色 token 带 `/N` 透明度修饰符（如 `bg-canvas/50`，会静默失效）、以及 `text-base`（`check-style-tokens.mjs` 门禁，白名单仅 chart-theme 与 globals）。确有必要保留例外时，整行加注释含 `style-tokens-ignore` 即可豁免该行。

### 1.1 中性色（mauve 灰阶）

| Token | 值 | 用途 |
|---|---|---|
| `ink-900` | `#211c33` | 标题、主文字 |
| `ink-700` | `#3d3654` | 次级文字、次级按钮文字 |
| `ink-500` | `#6f6884` | 弱化文字（标签、说明）——白底上最低可用正文灰 |
| `ink-400` | `#8d87a1` | 极弱 meta（时间戳、占位符）；不承载关键信息 |
| `line-soft` | `rgba(33,28,51,.05)` | 行分隔、卡内分隔 |
| `line` | `rgba(33,28,51,.07)` | 卡边框、区块分隔 |
| `line-strong` | `rgba(33,28,51,.09)` | 输入框边框、需要更明确的轮廓 |
| `surface` | `#ffffff` | 卡面 |
| `canvas` | `#faf9fc` | 页面画布底 |

### 1.2 品牌色（violet）

| Token | 值 | 用途 |
|---|---|---|
| `primary` | `#7c3aed` | 主色（图标点睛、激活指示线、链接、图表主系列） |
| `primary-hover` | `#6d28d9` | 主色悬停 / 紫晕底上的文字 |
| `primary-soft` | `rgba(124,58,237,.10)` | 激活态底、软药丸底、图标 chip 底 |
| `primary-soft-hover` | `rgba(124,58,237,.14)` | 软底悬停 |
| `primary-ring` | `#7c3aed` | focus ring（全站唯一） |
| `primary-border` | `rgba(124,58,237,.35)` | 选中描边 |
| `primary-gradient` | `linear-gradient(135deg,#7c3aed,#9333ea 60%,#a855f7)` | **仅**主 CTA 按钮与进度条填充 |

### 1.3 语义色（每组三件套：text / soft 底 / dot）

| Tone | text | soft | dot | 语义 |
|---|---|---|---|---|
| success | `#067647` | `rgba(16,185,129,.09)` | `#10b981` | 完成、已付款、在线、盈利 |
| warning | `#b45309` | `rgba(245,158,11,.11)` | `#f59e0b` | 待处理、待付款、临期、风险 |
| danger | `#dc2626` | `rgba(239,68,68,.09)` | `#ef4444` | 失败、逾期、解约、负值 |
| info | `#1d4ed8` | `rgba(59,130,246,.09)` | `#3b82f6` | 进行中、已联系、提示 |
| neutral | `muted-text #3d3654` | `muted-soft rgba(33,28,51,.05)` | `muted-dot #8d87a1` | 未开始、归档、默认 |
| violet | `primary-hover` | `primary-soft` | `primary` | 品牌语义（规划中、专属标记） |

> neutral tone 的实现 token 名为 **`muted-*`**（`bg-muted-soft` / `text-muted-text` / `bg-muted-dot`）。不用 `neutral-*` 命名：与 Tailwind 内置 neutral 灰阶同名会让门禁无法区分合法 token 与非法灰阶。

**状态枚举 → tone 全站映射**（唯一登记处，新增枚举必须在此登记）：

| 域 | 枚举 → tone |
|---|---|
| 创作者生命周期 | 潜在客户 neutral · 已联系 info · 已互动 info · 已入驻 violet · 准备直播 warning · 直播中 success(dot) · 已变现 success · 已解约 danger |
| 任务 | 待处理 warning · 进行中 info · 已完成 success · 失败 danger |
| 支出 | 预算 budgeted info · 待付款 ordered_unpaid warning · 已付款 paid success · 已退款 refunded info · 部分退款 partially_refunded warning |
| 战略节点 | 计划中 neutral · 进行中 info · 有风险 warning · 已完成 success · 已逾期 danger |
| 物品 | 使用中 success · 闲置 neutral · 维修 warning · 报废 danger |
| 工时任务 | 计划中 planned neutral · 进行中 doing info · 已完成 done success · 已取消 cancelled neutral |

> DevicePaymentStatus 与 ExpensePaymentStatus 同构，直接用 expense 域；VenueItemStatus 与 ThreadStatus 在 PR2/PR3 迁移对应界面时登记。

### 1.4 彩色图标 chip 色板（仅限侧栏与区块卡头图标）

violet / pink(`#db2777` on `rgba(236,72,153,.10)`) / blue(`#3b82f6` on 10%) / green(`#059669` on 10%) / amber(`#d97706` on 12%) / mauve(`ink-700` on `rgba(33,28,51,.06)`)。每个一级菜单固定一色，新菜单从中取色，禁止新造颜色。

### 1.5 图表（`src/lib/chart-theme.ts`，唯一白名单）

- `CHART_SERIES`：`#7c3aed`（首位，=UI 主色）→ `#3b82f6` → `#10b981` → `#f59e0b` → `#ec4899` → `#8d87a1`；同一图内禁止重复取色
- `AXIS`（刻度文字）`#8d87a1` · `GRID`（网格线）`rgba(33,28,51,.05)` · `TOOLTIP`（白底 + `line` 边框 + `shadow-pop`）
- 面积填充：`areaFill(id, color)` 工厂生成每系列独立渐变 id，主色 14%（`24` 后缀）→ 0（`00` 后缀）垂直渐变；线宽 1.8-2px

## 2. 字体与排版

- **字族**：sans = `"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif`；mono = `"SF Mono", ui-monospace, Menlo, monospace`（编号、金额、代码）
- **字重四档**：400 正文 / 500 强调、行主标题 / 600 区块标题、按钮、数值 / 700 页面标题、KPI 数字。禁止使用其他字重值（PingFang 无变量轴，奇数字重会被合成渲染）。
- **字号阶梯**（Tailwind fontSize 自定义）：

| Token | px | 用途 |
|---|---|---|
| `micro` | 11 | 计数角标、进度说明 |
| `xs` | 12 | meta 行、表头、标签 |
| `sm` | 13 | 正文、按钮、导航 |
| `md` | 14 | 行主标题、输入框文字 |
| `lg` | 15 | 区块卡头标题 |
| `xl` | 20 | 弹窗标题、二级页头 |
| `2xl` | 24 | 页面标题、KPI 数字 |

- **字距 token**（Tailwind letterSpacing 自定义）：`tracking-title` `-0.02em`（页面标题）/ `tracking-section` `-0.01em`（区块标题）/ `tracking-kpi` `-0.03em`（KPI 数字）
- 页面标题 `2xl/700/-0.02em`（`tracking-title`）；KPI 数字 `2xl/700/-0.03em/tabular`（`tracking-kpi`）；区块标题 `lg/600/-0.01em`（`tracking-section`）
- 数字规则：所有统计/金额加 `tabular-nums`；金额与编号用 mono；千分位逗号；负值用 danger text
- 截断规则：所有弹性文字容器 `min-w-0` + `truncate`（ja 长词风险），多行用 ClampedText

## 3. 空间、形状与深度

- **间距**：4px 基。卡内 padding 20（紧凑 16）；区块间距 16/20/24 三档；页面内容区 padding 28-32，`max-width 1220px`
- **控件高度三档**：28（紧凑 chip/表内控件）/ 32（默认按钮、输入、FilterChip）/ 38（页头 CTA、搜索框）
- **圆角**：card `14px`（`rounded-card`）/ field·chip `10px`（`rounded-field`）/ 图标 chip `7px`（`rounded-icon`）/ 按钮·药丸·dot·头像 `full`（`rounded-btn`/`rounded-full`）。禁止 `rounded-lg/xl/2xl` 裸用，一律走 token 类名
- **阴影两档**：`shadow-card` = `0 1px 3px rgba(33,28,51,.05), 0 8px 24px -12px rgba(124,58,237,.08)`；`shadow-pop`（弹层）= `0 4px 12px rgba(33,28,51,.08), 0 16px 40px -12px rgba(33,28,51,.18)`。禁止 Tailwind 原生 shadow-*
- **氛围底**：`bg-atmosphere` 单点定义（三层径向渐变，见 spec §3）；页面不得自定义底色/字体族/负 margin 逃逸容器
- **z-index 层级表**（唯一登记处）：内容 0 · 粘性头 10 · 下拉/popover 40 · 移动端抽屉 50 · Modal 60 · CommandBar 70 · Toast/通知 80

## 4. 动效与交互反馈

- hover/active：`transition-colors 150ms ease`；抽屉/侧栏位移 `200ms ease-out`；无数据入场动画
- focus：全站唯一 `focus-visible:ring-2 ring-primary-ring ring-offset-1`；禁止自定义 focus 样式
- 点击目标 ≥ 32×32px（移动端 ≥ 40）；行级操作（···）默认弱化、hover 显形
- `prefers-reduced-motion` 下关闭位移动画
- iOS：`pointer:coarse` 下表单控件 16px 字号规则保留（globals.css 既有）

## 5. 图标

- 唯一来源 lucide-react；尺寸三档 13 / 15 / 16px；`strokeWidth 1.5` 统一（默认 2 偏重，与轻盈气质冲突）
- 图标不单独承载语义（必配文字或 aria-label）；emoji 不出现在 UI chrome（问候语除外）

## 6. 组件规范（长期契约）

组件唯一存放地 `src/components/ui/`。**准入流程**：新 UI 需求先查本节与 ui/ 目录，没有再新建，且新建必须进本文件登记。同一文件内禁止混用共享组件与手写同类元素。多组件同文件用 named export（如 `Stat.tsx` 含 `StatBand`、`Field.tsx` 含五件）；Props 接口命名 `XxxProps`；类型导入一律 `import type`。

### 6.1 选型决策表

| 场景 | 用 | 不用 |
|---|---|---|
| 多列数值对比（财务预测月表） | `Table` 原语 | RecordRow |
| 记录浏览为主、每行有身份（支出/创作者/任务） | `RecordRow` | Table |
| 页内视图切换（列表/图表/汇总） | `Tabs` | 按钮组 |
| 小范围互斥切换（日/周/月，饼图/流向图） | `SegmentedControl` | Tabs |
| 状态展示 | `Tag`（soft 常规 / dot 用于行内低干扰） | 裸文本、手写 pill |
| 列表页顶部状态过滤 | `FilterChip count` 变体 | 自造汇总条 |
| 阻断式编辑/确认 | `Modal` | 手写遮罩 |
| 侧向上下文（讨论面板式） | DiscussionPanel 模式（PR3 后抽象为 Drawer） | Modal |

### 6.2 组件契约（props 为稳定 API，破坏性变更需改本文件）

- **Button** `variant: primary|secondary|ghost|danger` `size: sm|md|lg` `loading` `icon`；primary=渐变药丸（一屏至多一个），secondary=紫晕软药丸
- **SectionCard** `icon` `title` `actions` `footer` `padding: default|none` `accent`；卡头图标从 §1.4 色板取色，`accent` 从 §1.4 六色取，默认 `violet`
- **Tag** `tone`（§1.3 六 tone）`variant: soft|dot` `size: sm|md`；tone 取值必须走状态映射表
- **Stat / StatBand** `label` `value` `delta` `note` `tone`；数字自动 tabular；`delta.tone` 仅 `success|danger`；负值 `value` 由调用方显式传 `tone="danger"`（`value` 为 `ReactNode` 无法自动判负）
- **Table/THead/Th/Tr/Td** `Th: align|width`；表头 xs/`ink-400`，行分隔 `line-soft`，hover `rgba(124,58,237,.02)`
- **RecordRow** `status(tone)` `title` `meta: {icon?,text}[]` `amount` `tags` `who` `actions` `href`
- **Field** `label` `hint` `error` `required`；**Input/Select/Textarea** 统一 10px 圆角、`line-strong` 边框、`primary-ring`、高度 32；**SearchInput** `kbdHint`
- **FilterChip** `state: unset|set` `count` `onClear`；**Tabs** `items` `value` `onChange`；**SegmentedControl** 同
- **Modal** `open` `onClose` `title` `width` `footer`；Escape/portal/移动端底部弹出/safe-area 为不可退化能力
- **EmptyState** `icon` `title` `hint` `action`；**LoadingState** `variant: list|stats|plain`；**ErrorState** `title` `detail` `onRetry`
- **ProgressBar** `value` `max` `label` `tone`；`tone` 仅 `default|warning`，>90% 自动 warning；`label` 必填
- **可访问性底线**：所有交互组件可键盘到达；Modal/Drawer 焦点圈定；Tag dot 变体必带文字；色彩不作为唯一信息通道

### 6.3 页面模式（骨架级复用）

- **列表页** = PageHeader(title+sub+actions+tabs) → FilterChip count 状态汇总 → StatBand → SectionCard(RecordRow×n + 分页 footer)
- **详情页** = PageHeader(面包屑式 sub) → 左主列(SectionCard×n) + 右辅列(300px：进度/动态/关联)
- **表单** = Modal 或页内 SectionCard；Field 单列为主，成对短字段可两列；主按钮右下、次按钮在其左
- **三态**：数据页必须处理 loading（骨架优先）/empty（EmptyState + 首条引导 action）/error（ErrorState + 重试）；禁止裸 HTTP 状态码文案
- **危险操作**：Modal 确认 + danger Button + 不可逆后果一句话说明

## 7. 治理

1. `scripts/check-style-tokens.mjs`（挂 `test:copy` + CI `copy.yml`）：禁 slate/indigo/zinc/gray/stone/neutral 数字阶灰、裸 hex、固定透明度 token 带 `/N`、`text-base`；基线机制见 spec §4，终态零容忍；确有例外可整行加注释含 `style-tokens-ignore` 豁免
2. 组件准入流程见 §6 开头；PR 中出现新的裸样式组合需在描述中说明原因
3. 本文件与实现不一致 = bug：以先修正的一方为准并同 PR 同步另一方
4. 图表新增系列色、状态新增枚举、z-index 新增层：先登记本文件，再写代码
