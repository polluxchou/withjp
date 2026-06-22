# 公会场地 2D 布置页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增画布优先的 2D 场地布置页，并在现有成本/财务规划页面提供二级入口。

**Architecture:** 数据模型和纯更新逻辑放在 `src/venue/layoutData.ts`，页面状态编排放在 `src/app/[locale]/(app)/guild-venue/page.tsx`，画布和属性面板拆成独立组件。入口不放 Sidebar 顶层，而是在财务预测的成本预算区域增加“场地布置”跳转。

**Tech Stack:** Next.js App Router、React、TypeScript、SVG、next-intl、Node test runner。

---

### Task 1: 场地数据模型和测试

**Files:**
- Create: `src/venue/layoutData.test.ts`
- Create: `src/venue/layoutData.ts`
- Modify: `package.json`

- [x] 写失败测试，覆盖添加对象、更新对象、删除对象、撤销/重做和无效持久化回退。
- [x] 运行 `node --test --experimental-strip-types src/venue/layoutData.test.ts`，确认因模块缺失失败。
- [x] 实现 `layoutData.ts` 的类型、示例数据和纯函数。
- [x] 再次运行单测，确认通过。
- [x] 把新测试加入 `npm test` 脚本。

### Task 2: 画布和属性面板

**Files:**
- Create: `src/venue/VenueCanvas.tsx`
- Create: `src/venue/VenueInspector.tsx`

- [x] 实现 SVG 网格画布、对象渲染、选中、拖拽、缩放、底图显示和 SVG 导出引用。
- [x] 实现属性面板，支持名称、类型、状态、位置、尺寸、旋转、备注编辑和空状态。

### Task 3: 页面组合和二级入口

**Files:**
- Create: `src/app/[locale]/(app)/guild-venue/page.tsx`
- Modify: `src/components/finance-forecast/FinanceForecastDashboard.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

- [x] 组合顶部工具栏、左侧窄工具栏/浮动列表、画布、右侧属性面板。
- [x] 实现添加对象、撤销/重做、保存 localStorage、导出 JSON、导出 SVG、底图配置。
- [x] 在财务预测页成本预算区域增加二级入口到 `/guild-venue`。
- [x] 增加中英文文案。

### Task 4: 验证

**Files:**
- Verify only

- [x] 运行 `node --test --experimental-strip-types src/venue/layoutData.test.ts`。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 启动本地服务，打开 `/zh/guild-venue` 和 `/zh/finance-forecast`。未登录浏览器按现有鉴权重定向到 `/zh/login`，因此交互级手动验证需要登录态。
