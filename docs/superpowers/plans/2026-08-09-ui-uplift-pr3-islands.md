# 界面风格提升 · PR3 孤岛消除 + 图表统一 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 消灭 slate+indigo 老皮肤孤岛（items / guild-venue chrome / venue inspector）、收敛 workspace 私有皮肤、全部剩余 recharts 接 chart-theme、knowledge/config 顺路迁完、死类清理。

**Architecture:** 与 PR2 并行的独立分支（页面集不相交）。样板范例 expenses 页；权威 `docs/design-system.md`。**venue 边界铁律**：渲染在 canvas/SVG/3D 里的 = 工程语义色不动；DOM 面板/工具栏/表单 = chrome 全迁。拿不准的截图列清单报告，不要猜。

**铁律**：同 PR2（只动渲染层 / t() 全覆盖 / 基线只减不增 / 每 commit 三绿 / commit 前 rebase origin main 一次）。

---

## Task 0: 工作区

worktree 已建好：`/Users/fengzhou/Code/newWith/.claude/worktrees/ui-uplift-pr3`，分支 `feat/ui-uplift-pr3-islands`。`npm install` → 本计划 cp 进 docs 并首 commit → 基线五绿验证。

## Task 1: 物品管理（items/page.tsx + items/ItemForm.tsx + ItemDetail.tsx）

- [ ] slate/indigo 全清（indigo-600 主按钮→Button、slate 表格→Table 原语、筛选→SearchInput/Select、状态→Tag(toneOf('item'))）
- [ ] **修裸 i18n key**：统计条显示 `items.statTotalItems`/`items.statItemUnit`/`items.statTotalCost` 原样文本——核查 messages 三语该 key 是否缺失/错拼，补齐后统计条改用 StatBand + Stat
- [ ] ItemForm/ItemDetail 手写 modal→共享 Modal（footer prop）+ Field 系；本地 input 样式常量删除
- [ ] Commit ×1-2

## Task 2: 场地布置 chrome（guild-venue/page.tsx 2152 行 + venue/VenueInspector.tsx 425 行 + FloatingPanel 等）

- [ ] **只迁 DOM chrome**：顶部工具栏（ToolbarButton→Button ghost/secondary 或保留本地组件但 token 化——按侵入度自行判断并报告）、左侧浮动面板（当前场地卡/空间列表/tab）、右侧属性检查器（VenueInspector 全部控件→Field 系、LayerButton token 化）、底部楼层切换、弹窗（rounded-2xl 手写 modal→共享 Modal）
- [ ] slate/indigo→token 映射表（slate-50→canvas、slate-100→line-soft、slate-200→line-strong、slate-400/500→ink-400/500、slate-900→ink-900、indigo-50/indigo-700 选中态→primary-soft/primary-hover、indigo-600 按钮→Button 或 bg-primary）
- [ ] **画布不动清单**：VenueCanvas.tsx / Venue3DCanvas.client.tsx 内 SVG/three.js 的语义色（标注红、承重黄、空间紫等）全部保留；这两个文件里若有 DOM 面板混杂，只动 DOM 部分
- [ ] 2D/3D 切换、缩放控件、标尺开关等小件 token 化
- [ ] Commit ×2-3（page chrome / inspector / 弹窗与杂项）
- [ ] 完成后 dev server 截图：2D 视图 + 检查器 + 3D 视图各一张（确认画布语义色未变、chrome 已新语言）

## Task 3: workspace 收敛（workspace/page.tsx 673 行）

- [ ] 删除 `-my-8 -mx-8` 负 margin 逃逸与内联 `background/color/fontFamily` 覆写（:239 附近）——页面直接坐在氛围底上，聊天区面板用 bg-surface 卡
- [ ] 28 处 inline style 清理成 token 类；DEPT_META 六色→改用 `ACCENT_CHIP`/accent token（部门→accent 映射登记在文件内常量）
- [ ] 聊天布局（左列表右会话）与全部交互逻辑不动；HeaderIconBtn 本地组件 token 化或换 Button ghost
- [ ] Commit ×1

## Task 4: 剩余图表接 chart-theme

- [ ] `devices/DeviceCostChart.tsx`（9 hex）：系列色→seriesColor/语义 var、轴/网格/tooltip→AXIS/GRID/TOOLTIP_STYLE/TOOLTIP_LABEL_STYLE
- [ ] `finance-forecast/FinanceForecastDashboard.tsx` 图表段（47 hex 中的图表部分）：同上；生命周期色常量若与语义对应改语义 var，纯系列色走 seriesColor；**该文件非图表部分的 zinc/violet 硬编码本 PR 不动**（留 PR4 清扫），只动 recharts 相关
- [ ] `expenses/ExpenseSankeyChart` 已迁（PR1）；grep 全库 `<ResponsiveContainer|recharts` 确认无遗漏文件
- [ ] Commit ×1

## Task 5: knowledge + config 顺路迁完

- [ ] knowledge：左列表卡→SectionCard/RecordRow（报告选择）、分类 pill→Tag、右栏未选中空白→EmptyState（「选择一个条目」引导）
- [ ] config：硬编码 "Loading..."→LoadingState（i18n key `common.loading`）；表单→Field 系；卡片→SectionCard
- [ ] Commit ×1

## Task 6: 死类与杂项清理

- [ ] globals.css 删除 `.bg-texture` 与 `.sidebar-frosted`（全库 grep 确认零引用）
- [ ] 侧栏 `roles.tech` 裸 key：核查 messages 三语 `roles.tech`（或 profile 区用的 key）缺失并补齐（zh：技术 / ja：テック / en：Tech——按 copy-glossary 校正）
- [ ] devices/page.tsx（redirect）与空 competitors 目录不动
- [ ] Commit ×1

## Task 7: 收口

- [ ] `--update-baseline` 收紧（shrink-only；slate/indigo 应从基线大规模消失）；全量五绿；push `feat/ui-uplift-pr3-islands`（不开 PR）
- [ ] 报告：基线数字变化（重点 guild-venue 196→? / VenueInspector / items）、画布边界灰区清单（截图）、API 缺口

## Self-Review 记录

覆盖 spec §6 PR3 全部条目（items/venue chrome/workspace/图表/knowledge+config/死类）✓；venue 画布边界规则写死 ✓；与 PR2 文件集不相交（唯一共享：messages、baseline——rebase 与收口时处理）✓。
