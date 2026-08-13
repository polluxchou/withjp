# 界面风格提升 · PR2 高频页 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 六个高频页面 + CommandBar 迁移到 PR1 落地的设计语言（组件库已冻结，样板间 `src/app/[locale]/(app)/expenses/page.tsx` 是唯一权威范例）。

**Architecture:** 纯消费方迁移——组件从 `@/components/ui/*` 取，色彩/形状/字号只用 token，状态一律 `Tag + toneOf`。每页一个 commit，三绿后进下一页。发现组件 API 缺口不硬凑，报 DONE_WITH_CONCERNS。

**Tech Stack:** 同 PR1。权威：`docs/design-system.md`；样板范例：expenses 页（RecordRow 映射/三态/CountChip/StatBand/portal 弹层的既定写法全在里面）。

**铁律（与 PR1 Task 13 相同）**：只动渲染层；文案全 t()（新 key 三语齐 + test:i18n 绿）；门禁基线只减不增（迁完的文件应归零；**除最终收口外不跑 --update-baseline**）；每 commit `tsc + npm test + test:copy` 三绿；与 ja 翻译修复会话可能并发改 messages/ja.json——commit 前 `git pull --rebase origin main` 一次。

---

## Task 0: 工作区

worktree 已建好：`/Users/fengzhou/Code/newWith/.claude/worktrees/ui-uplift-pr2`，分支 `feat/ui-uplift-pr2-highfreq`（origin/main 含 PR1）。`npm install` → 本计划文件 cp 进 `docs/superpowers/plans/` 并首 commit → 基线验证五绿。

## Task 1: 仪表盘（`(app)/page.tsx` + dashboard/StatsCard + tasks/TaskCard + creators/LifecycleBadge）

- [ ] KPI 四卡：`StatsCard` 调用替换为 `StatBand + Stat×4`（图标 chip 退役——新语言 KPI 无图标；delta/note 按现值）。`StatsCard.tsx` 若无其他引用则删除 + 基线僵尸处理留到收口
- [ ] `LifecycleBadge.tsx` 内部改为 `<Tag tone={toneOf('creator', status)} variant={status === 'live' ? 'dot' : 'soft'}>`（保留对外 props——它被 dashboard/pipeline/creators 多页引用，改一处全站生效；`creator-lifecycle.ts` 里的 STATUS_COLOR 类名表若因此无引用则删除）
- [ ] 流程漏斗卡→`SectionCard`（icon+title，accent violet）；漏斗条色用 token
- [ ] 最近任务：`TaskCard` 列表→`RecordRow`（status=toneOf('task')、meta=创作者·平台、tags=agent Tag、who）；`TaskCard.tsx` 若 tasks 页仍用则只 token 化不删
- [ ] 最近创作者表→`Table 原语`（THead/Th/TBody/Tr/Td）或 RecordRow（自行判断哪个符合 §6.1 决策表——四列身份行 → RecordRow 更合适，报告选择）
- [ ] 空态已用 EmptyState 的保持；页面问候语 PageGreeting 不动
- [ ] Commit：`feat(dashboard): 仪表盘迁移新语言（StatBand/RecordRow/SectionCard/Tag 化生命周期徽章）`

## Task 2: 创作者列表 + 详情（creators/page.tsx、creators/[id]/page.tsx、CreatorForm.tsx）

- [ ] 列表：行→RecordRow（status=toneOf('creator')、meta=平台·领域、href=详情）；搜索/筛选→SearchInput/Select/CountChip（参照 expenses）；错误态→ErrorState（替换 HTTP 503 黄条）；加载→LoadingState list
- [ ] 详情页：4 处手写空态→EmptyState；子表→Table 原语；标题里的 block div 修复（h1 内不放 div，换 span truncate——PR1 审查遗留 Minor）
- [ ] CreatorForm（17 处 violet 硬编码）：控件→Field/Input/Select/Textarea，按钮→Button，弹窗若手写→共享 Modal
- [ ] Commit ×1

## Task 3: 流程管理（pipeline/page.tsx）

- [ ] 看板列头状态 pill 统一走 LifecycleBadge（Task 1 已 Tag 化）——「已互动」「已解约」裸文本自动消失
- [ ] 看板卡片 token 化（zinc→ink/line，圆角→token）；空列虚线占位保留但换 line token
- [ ] 状态机规则说明卡→SectionCard；横向滚动容器保留
- [ ] Commit ×1

## Task 4: 任务中心（tasks/page.tsx + work-tasks/WorkloadDay/Week/MonthView + SalaryManager + WorkTaskForm）

- [ ] 工时视图/AI 任务 双 tab→`Tabs`；日/周/月→`SegmentedControl`；KPI 四卡→StatBand
- [ ] 原生 date input→`Input type="date"`（Field 包裹）；添加任务→Button
- [ ] 空态「今天没有任务」→EmptyState；右侧抽屉手写遮罩→共享 Modal（或保留抽屉结构仅 token 化——按工作量自行判断，报告选择）
- [ ] 三个 Workload 视图 + SalaryManager + WorkTaskForm：zinc/手写 pill→token/Tag（工时任务态 toneOf('work_task')，注意 cancelled 红→灰是已登记的有意变更，PR 描述提一句）；表格→Table 原语
- [ ] Commit ×1（文件多可拆 2 个 commit）

## Task 5: 战略时间轴（timeline/page.tsx + timeline/[id]/page.tsx + milestones/NextTimelineView.tsx + MilestoneForm/MilestoneStatusBadge）

- [ ] 视图切换（接下来30天/列表/时间线/进度曲线）→页头 `Tabs`（PageHeader tabs slot，参照 expenses 的状态提升）；筛选 chips→CountChip/FilterChip
- [ ] **修三处布局碰撞**（本 PR 唯一的非机械项）：NextTimelineView 节点卡重叠（实现简单碰撞避让：同象限按 x 排序错层/加 max 宽换行）、左端日期截断（容器 padding/文本锚点修正）、右端「+30天」换行错位（flex-none + whitespace-nowrap）。修复后用 harness/dev server 截图验证三处
- [ ] 内联 12 处 hex 图表→chart-theme；风险卡/警示条→token；MilestoneStatusBadge→Tag(toneOf('milestone'))；MilestoneForm 控件→Field 系
- [ ] Commit ×1-2

## Task 6: 团队三页（team/page.tsx、team/assignments/page.tsx、team/org/page.tsx + OrgView + AgentModelEditor）

- [ ] team：agent 卡→SectionCard；**输入/输出 JSON schema 收进 `<details>` 折叠**（默认收起）；待处理/已完成/失败 stat trio→三个 Tag 或小号 Stat（报告选择）；模型选择→Select + Button
- [ ] assignments：KPI→StatBand；虚线空态→EmptyState
- [ ] org（业务分工）：嵌套卡减层——外层 SectionCard、任务组用发丝线分隔而非卡套卡；行→Table 原语或简化行；负责人名字 `text-ink-400`→`text-ink-500`（对比度）；岗位 pills→Tag
- [ ] Commit ×1
 
## Task 7: CommandBar 换皮（intent/CommandBar.tsx，439 行）

- [ ] 浮动药丸/面板/表格 token 化（zinc→token、rounded→token、shadow→shadow-pop）；z-index 对齐层级表 70；交互与入口不变
- [ ] Commit ×1

## Task 8: 收口

- [ ] `--update-baseline` 收紧（shrink-only diff 验证）；全量五绿；push `feat/ui-uplift-pr2-highfreq`（不开 PR）
- [ ] 报告：每页基线数字变化表、API 缺口清单、走查待办（登录态项留给控制器）

## Self-Review 记录

规格覆盖 spec §6 PR2 全部条目（六页 + CommandBar + 时间轴碰撞修复 + LifecycleBadge Tag 化）✓；无占位符 ✓；组件 API 全部引用 PR1 冻结契约 ✓。
