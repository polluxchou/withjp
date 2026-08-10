# 界面风格提升 · PR4 细节清扫 + 门禁上锁 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 清空 style-tokens 基线剩余全部可迁移存量（20 文件/544 → 白名单外归零），落地画布灰区甲/丙案与角色体系缺口，删除基线转 CI 零容忍硬门禁，为整轮风格提升收官。

**Architecture:** 基于 PR1-PR3 已定型的组件与 token 体系做纯清扫，无新组件。样板范例 `src/app/[locale]/(app)/expenses/page.tsx`；权威 `docs/design-system.md`。**豁免边界（spec「不动的」）**：登录页（独立营销位）与 venue 两画布文件的工程语义色不迁移，进门禁白名单。

**铁律**：同 PR3（只动渲染层 / t() 全覆盖 / 基线只减不增直至删除 / 每 commit 三绿 / 每任务 commit 前 rebase origin/main 一次）。

**开放 PR 冲突预警**：#156（work-tasks i18n，动 messages）、#157（门禁正向校验，动 check-style-tokens.mjs）、#162（pipeline 错误反馈）都可能中途合入。每任务 rebase 时留意；**Task 6 上锁前必须 rebase 并适配 #157 若已合入**（其正向校验与本计划白名单机制需共存）。

**明确不做（递延登记，勿顺手）**：PR2 四项递延（Td tone prop 弱化失效 / Modal z-70 深度感知 / CountChip slice 计数 / mutation 错误反馈家族其余页面）、DiscussionPanel→Drawer 抽象、登录页迁移、PR2 changelog 条目（另行查重处理）。

---

## Task 0: 工作区

worktree 已就位：`/Users/fengzhou/Code/newWith/.claude/worktrees/ui-uplift-pr4`，分支 `feat/ui-uplift-pr4-sweep`（基于含 PR #155/#161 的 main 23eeb33）。`npm install` → 本计划 commit → 五绿基线验证。

## Task 1: finance-forecast 清扫（FFD 非图表段 153 + ForecastViewBar 41 + LifecycleTemplateEditor 25）

- [ ] `FinanceForecastDashboard.tsx` 非图表段（图表段 PR3 已迁）：KPI 卡、输入表格、卡壳、tab/工具条的 zinc/violet 全清——zinc-50→canvas、zinc-100→line-soft、zinc-200→line-strong、zinc-400→ink-400、zinc-500→ink-500、zinc-600/700→ink-700、zinc-900→ink-900、violet-50/100→primary-soft、violet-600/700→primary/primary-hover、rounded-lg/xl→rounded-field/card（按控件/卡语境）、shadow-sm/md→shadow-card
- [ ] `ForecastViewBar.tsx`（含 fixed inset-0 手写弹层）：视图切换条 token 化；手写弹层→共享 Modal 或 popover token 化（按语义判断并报告——阻断式编辑用 Modal，非阻断下拉保留本地但 token 化）
- [ ] `LifecycleTemplateEditor.tsx`（含 fixed inset-0 手写 modal）→ 共享 Modal（footer prop）+ Field 系
- [ ] 表单控件→Field/Input/Select 系；数字输入保留既有 NumberInput 行为仅换皮
- [ ] Commit ×2-3（FFD / ViewBar+LifecycleEditor）

## Task 2: discussions 簇（ThreadView 31 + DiscussionPanel 19 + ThreadList 18 + DiscussionBadge 7）

- [ ] 四文件 zinc→token 全清（映射表同 Task 1）；状态展示若有裸文本/手写 pill→Tag（ThreadStatus 的 tone 映射先登记 design-system.md §1.3 再写代码——遵守治理条款）
- [ ] `DiscussionPanel.tsx` 的 fixed inset-0 遮罩：**保留侧滑面板模式**（Drawer 抽象不在本 PR），仅遮罩/面板壳 token 化（bg-black/50、shadow-pop、rounded-card、z-index 按 §3 层级表）
- [ ] 三态核查：列表空态→EmptyState、加载→LoadingState（如原文件有裸文案）
- [ ] Commit ×1-2

## Task 3: competitors 簇（CompetitorCard 33 + DossierView 7 + ShotAlbum 3 + ShotUploader 3）+ NotificationPanel 12

- [ ] competitors 四文件 zinc→token；CompetitorCard 内数字/指标加 tabular-nums（若缺）
- [ ] `ShotAlbum.tsx` 的 fixed inset-0（图片 lightbox）：保留 lightbox 模式仅 token 化（全屏看图不是表单 Modal，不强迁）——判断并报告
- [ ] `NotificationPanel.tsx`：zinc→token；弹层 z-index 对齐 §3（下拉/popover 40 或 Toast 80，按实际语义）
- [ ] Commit ×1-2

## Task 4: 表单散件 + 角色体系 + changelog kind 色

- [ ] `DeviceForm.tsx`(11)→共享 Modal+Field 系（参照 PR3 的 ItemForm 迁法，commit 250fd0d 可查）；`ExpenseForm.tsx`(9) 残留 zinc/rounded 清零；`PendingActionCard.tsx`(4)、`DateRangeSlider.tsx`(3，ui/ 自有组件违规就地修，violet-500/600→primary、shadow-md→shadow-card)
- [ ] `ProfileEditor.tsx`(11)：token 清零 + **角色体系补全**——`src/lib/types/index.ts` AgentRole 类型 6→8 值（补 'pmo'|'tech'，对齐 DB enum）；ROLES 下拉数组加 'tech'（真人可选角色）；**'pmo' 不进下拉**（AI 代理专属角色，加注释说明）；messages 三语补 `roles.pmo`（zh：PMO / ja：PMO / en：PMO——按 copy-glossary 校正，若无条目则用 PMO 原文）
- [ ] `Sidebar.tsx` tRoles 兜底：未注册角色回退显示原始 role 字符串而非裸 key（参照 workspace 页 isKnownRole 模式）
- [ ] `config/changelog/page.tsx` kind 色出门禁盲区：feat ring-violet-100→primary-border、fix bg-rose-50→danger-soft、improve bg-amber-50→warning-soft、security bg-emerald-50→success-soft（text 同步 §1.3 三件套）
- [ ] Commit ×2（散件+表单 / 角色体系+changelog 色）

## Task 5: 横向清扫（spec §6 PR4 条目）+ 画布灰区丙案

- [ ] **裸 i18n key 全扫**：写一次性脚本（scratchpad，不入库）提取全库 `t('key')`/`useTranslations('ns')` 组合并对照 messages/zh.json 平铺 key 集，缺失项列清单并三语补齐（en/ja 同步）；扫描结果贴报告
- [ ] **focus ring 收口**：grep `focus:outline-none`（无伴随 ring 的）与非标准 `focus:ring-`/`focus-visible:ring-`（非 primary-ring 配方）→ 统一 `focus-visible:ring-2 ring-primary-ring ring-offset-1`（滚动容器内用 ring-inset，§4 例外规则）
- [ ] **状态色映射复制删除**：grep 本地 STATUS_COLOR/TONE/BADGE 类常量（status-tone.ts 之外的状态→颜色映射）→ 全部改走 `toneOf`；发现未登记枚举先登记 design-system.md §1.3
- [ ] **手写 modal 终审**：`fixed inset-0` 全库清点。Task 1-4 已迁除外；`Sidebar.tsx`（移动端抽屉，非 modal）与 `tasks/page.tsx`（PR2 页面集，若仍有残留仅报告）分类说明，其余若仍有手写遮罩一律迁 Modal 或说明豁免理由
- [ ] **EdgeLabelOverlay 丙案**（pollux 已拍板）：`Venue3DCanvas.client.tsx:~1353` chips 的 chrome 属性 token 化——rounded-md→rounded-field、shadow-sm→shadow-card、text-[11px]→text-micro、text-slate-700→text-ink-700、border-slate-200→border-line；**选中色 #f4511e 与引线 #94a3b8 保留**（场景语义）
- [ ] Commit ×1-2

## Task 6: 门禁上锁

- [ ] rebase origin/main；**若 #157（正向校验）已合入，适配其机制**（白名单与正向校验共存，冲突时以两者合集为准并报告）
- [ ] `check-style-tokens.mjs` 白名单扩充：`src/venue/VenueCanvas.tsx`、`src/venue/Venue3DCanvas.client.tsx`（工程制图语义色，甲案）、`src/app/[locale]/login/page.tsx`（独立营销位，spec「不动的」）——白名单行附一句理由注释
- [ ] 甲案三处 DOM 灰区加**成对说明注释**（非门禁功能，防将来单边改）：VenueCanvas:458 桌面灰、:461/:468 纸面套件、Venue3DCanvas:251 容器底（与场景 `<color '#f8fafc'>` 配对勿单改）
- [ ] 全库跑 `node scripts/check-style-tokens.mjs`：白名单外违规必须为 0；**删除 `scripts/style-tokens-baseline.json`**（脚本既有语义：文件不存在=零容忍）
- [ ] `docs/design-system.md` §7 治理条款同步：基线机制退役、改为零容忍+白名单表述；spec §4 如有状态行同步
- [ ] Commit ×1

## Task 7: 收口

- [ ] 全量五绿 + tsc；dev server 走查截图：finance-forecast、讨论面板（任一入口页）、competitors、通知面板、profile 编辑器各一张，贴 PR 描述
- [ ] push `feat/ui-uplift-pr4-sweep`；gh 开 PR（标题 `feat(ui): 风格提升 PR4 细节清扫+门禁上锁`，不合并）
- [ ] 报告：基线 544→0（白名单化）明细、裸 key 扫描结果、focus/状态映射/手写 modal 清点结论、与 #156/#157/#162 的合流状态

## Self-Review 记录

覆盖 spec §6 PR4 全部条目（裸 key 全扫/focus ring 收口/状态色映射删除/手写 modal 归零/门禁转硬）✓；spec「不动的」豁免走白名单而非迁移 ✓；pollux 拍板的甲案（Task 6）与丙案（Task 5）落地 ✓；角色体系缺口（PR3 报告项）在 Task 4 ✓；changelog kind 色盲区在 Task 4 ✓；PR2 递延四项明确排除 ✓；开放 PR 冲突预案写入铁律区 ✓；基线 20 文件逐一有归宿（Task 1: FFD/ViewBar/LifecycleEditor；Task 2: discussions×4；Task 3: competitors×4+NotificationPanel；Task 4: DeviceForm/ProfileEditor/ExpenseForm/PendingActionCard/DateRangeSlider；Task 6 白名单: VenueCanvas/Venue3DCanvas/login）✓——合计 19 文件 + login（38）= 20 ✓。
