# Bug Fix Report — 4 Modules Code Review
**Date**: 2026-05-12  
**Scope**: Accounts / Timeline / Expenses / Finance Forecast  
**Build**: ✅ Pass  
**Tests**: ✅ 52 / 52 Pass

---

## 执行摘要

本次 Code Review 对 4 个业务模块进行了系统性审查，共发现 **55 个潜在问题**，确认 **52 个为真实 Bug**，全部完成修复，3 个确认为设计行为（非 Bug）。

### 评审范围

| 模块 | 路由 | 页面组件 | 业务逻辑 |
|------|------|---------|---------|
| Accounts（账户） | `api/creators`, `api/broadcast-accounts` | `creators/page.tsx`, `CreatorForm.tsx` | 平台规范化、状态机 |
| Timeline（时间轴） | `api/milestones`, `api/milestones/[id]` | `timeline/page.tsx`, `timeline/[id]/page.tsx`, `MilestoneForm.tsx` | 状态自动同步、任务生成 |
| Expenses（支出） | `api/expenses`, `api/expenses/[id]` | `expenses/page.tsx`, `ExpenseForm.tsx` | 支出汇总、跨境费用、分类逻辑 |
| Finance Forecast（财务预测） | `api/finance-forecast` | `finance-forecast/page.tsx`, `FinanceForecastDashboard.tsx` | 收益计算、持久化、汇率转换 |

### 发现规律

审查过程中发现 4 类反复出现的系统性问题模式：

1. **loading 状态未受保护**：`setLoading(false)` 未放入 `finally`，网络异常时按钮永久卡死。跨 6 个组件重复出现。
2. **API 路由无 JSON 解析守卫**：`await req.json()` 未包裹 try-catch，malformed body 返回 500 而非 400。共 8 条路由。
3. **导航/回调不检查 res.ok**：删除/更新失败后仍执行成功路径（跳转、刷新列表）。
4. **硬编码魔法数**：`7`（天）风险阈值、`6.9`（汇率）在多文件重复定义，修改其一会导致不一致。

---

## 总览

| 优先级 | 发现问题 | 确认为 Bug | 非 Bug | 已修复 |
|--------|---------|-----------|--------|--------|
| Critical | 14 | 12 | 2 | **12 / 12** ✅ |
| Medium   | 19 | 18 | 1 | **18 / 18** ✅ |
| Minor    | 22 | 22 | 0 | **22 / 22** ✅ |
| **合计** | **55** | **52** | **3** | **52 / 52** ✅ |

---

## Critical 修复明细（12 项）

### 账户模块 (Accounts)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| C1 | `res.ok` 检查缺失，错误信息硬编码中文 | `creators/page.tsx`, `CreatorForm.tsx` | ✅ |
| C2 | 关闭表单后重新打开，表单状态未重置（旧数据残留） | `creators/page.tsx` | ✅ |
| C3 | `Promise.all` 任意一个请求失败会清空另一个的数据 | `CreatorForm.tsx` | ✅ |

**修复方式**：
- C1：在 `.json()` 前加 `if (!res.ok) throw new Error()` 守卫；将 `'加载失败'` 替换为 `tCommon('loadFailed')`
- C2：将 `<Modal>` 包在 `{showForm && ...}` 条件渲染中，强制 unmount/remount
- C3：对 `broadcastRes` / `usersRes` 分别独立检查 `ok`，互不干扰

---

### 时间轴模块 (Timeline)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| TL-C1 | 日期转 ISO 使用本地午夜，UTC+8 用户日期偏移一天 | `MilestoneForm.tsx` | ✅ |
| TL-C2 | `syncStatusByTime` 每次 GET 都执行，无节流 | `api/milestones/route.ts` | ✅ |
| TL-C3 | 网络异常时 `setSaving(false)` 未执行，按钮永久 loading | `MilestoneForm.tsx` | ✅ |
| TL-C4 | PATCH API 未校验 start_date > target_date | `api/milestones/[id]/route.ts` | ✅ |

**修复方式**：
- TL-C1：改为 `` `${form.start_date}T00:00:00.000Z` `` 模板字符串，避免时区偏移
- TL-C2：模块级 `lastSyncAt` 变量 + 60 秒节流
- TL-C3：`try/catch/finally` 包裹 fetch，`setSaving(false)` 放入 `finally`
- TL-C4：更新前校验 `new Date(startDate) >= new Date(targetDate)` 则返回 400

---

### 支出模块 (Expenses)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| EX-C1 | 总支出 KPI 含跨境手续费，但无说明标签 | `expenses/page.tsx` | ✅ |
| EX-C2 | `buyer_name` 豁免判断区分大小写（`With-New` 会被收跨境费） | `costs.ts` | ✅ |

**修复方式**：
- EX-C1：在 KPI 卡片下方加副标签 `{t('includesFees')}` = "含跨境手续费"
- EX-C2：`e.buyer_name?.toLowerCase() === 'with-new'`

---

### 财务预测模块 (Finance Forecast)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| FC-C1 | 保存时先 DELETE 所有行再 INSERT，INSERT 失败数据丢失 | `service.ts` | ✅ |
| FC-C2 | 浮点数精度误差导致 `33.599999...` 展示漂移 | `calculations.ts` | ✅ |
| FC-C3 | CNY→USD 汇率在两个文件中各自定义，可能不一致 | `currency.tsx`, `calculations.ts` | ✅ |

**修复方式**：
- FC-C1：改为 Upsert + Delete-not-in 模式（幂等，安全）
- FC-C2：`Math.round(x * 10000) / 10000` 保留 4 位小数
- FC-C3：提取 `src/lib/currency-rates.ts` 作为单一来源，两处统一 import

---

### 确认非 Bug（Critical 2 项）

| ID | 结论 |
|----|------|
| EX-C3 DateRangeSlider | `onChange` → `setFilters` → `load()` 触发 API 重新拉取 KPI，逻辑正确 |
| FC-C4 draft 不保存 budget_cost_usd | 设计如此：预算成本始终从服务端同步，draft 中保存会导致预算数据过期 |

---

## Medium 修复明细（18 项）

### 账户模块 (Accounts)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| M1 | `followers` / `avg_views` 输入框接受负数 | `CreatorForm.tsx` | ✅ |
| M2 | 新建直播账号子表单打开时，平台未同步到创作者当前平台 | `CreatorForm.tsx` | ✅ |
| M3 | `req.json()` 无 try-catch，malformed JSON 返回 500 | `api/broadcast-accounts/route.ts` | ✅ |
| M4 | 空字符串 platform 传入 `normalizeCreatorPlatform` 可能异常 | `api/broadcast-accounts/route.ts` | ✅ |
| M5 | 搜索框每次击键都触发 API 请求（无防抖） | `expenses/page.tsx` | ✅ |

---

### 时间轴模块 (Timeline)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| TL-M1 | 进度曲线"已启动"指标单调递增，无实际意义 | `timeline/page.tsx` | ✅ |
| TL-M2 | 自动生成任务时，UPDATE `linked_task_ids` 失败会产生孤儿任务 | `auto-tasks.ts` | ✅ |
| TL-M3 | Agents 请求无 AbortController，组件卸载后仍可能设置状态 | `MilestoneForm.tsx` | ✅ |
| TL-M4 | `7 天`风险阈值在 route.ts 和 page.tsx 中各自硬编码 | `constants.ts`（新增）, `route.ts`, `page.tsx` | ✅ |

---

### 支出模块 (Expenses)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| EX-M1 | `categoryHasPeriod()` 对所有分类均返回 true（逻辑错误） | `costs.ts` | ✅ |
| EX-M2 | `currentMonthCost` 用 UTC 月份计算，UTC+8 用户跨日误差 | `costs.ts` | ✅ |
| EX-M3 | `load()` 无 AbortController，旧请求响应可能覆盖新数据 | `expenses/page.tsx` | ✅ |
| EX-M4 | `confirmDelete` 网络异常时 loading 状态卡死 | `expenses/page.tsx` | ✅ |
| EX-M5 | 表单允许提交零或负数数量 | `ExpenseForm.tsx` | ✅ |

---

### 财务预测模块 (Finance Forecast)

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| FC-M2 | 无收入月份毛利率显示 `0%`，误导为收支平衡 | `calculations.ts`, `FinanceForecastDashboard.tsx` | ✅ |
| FC-M3 | `loadFinanceForecastYear` 失败时静默降级，无日志 | `finance-forecast/page.tsx` | ✅ |
| FC-M4 | 编辑后保存状态仍显示上次的 "Saved"，直到 700ms 后才更新 | `FinanceForecastDashboard.tsx` | ✅ |
| FC-M5 | 快速连续添加行时 ID 可能碰撞（`Date.now()` 精度 1ms） | `FinanceForecastDashboard.tsx` | ✅ |

---

### 确认非 Bug（Medium 1 项）

| ID | 结论 |
|----|------|
| FC-M1 AbortController | 保存 effect 中已有 `AbortController + clearTimeout` 正确实现，无需修复 |

---

## Minor 修复明细（22 项）

### A 组：API 路由 `req.json()` 无 try-catch（7 项）

| ID | 文件 | 状态 |
|----|------|------|
| A1 | `api/creators/route.ts` (POST) | ✅ |
| A2 | `api/creators/[id]/route.ts` (PATCH) | ✅ |
| A3 | `api/expenses/route.ts` (POST) | ✅ |
| A4 | `api/expenses/[id]/route.ts` (PATCH) | ✅ |
| A5 | `api/milestones/route.ts` (POST) | ✅ |
| A6 | `api/milestones/[id]/route.ts` (PATCH) | ✅ |
| A7 | `api/finance-forecast/route.ts` (PUT) | ✅ |

**修复方式**：所有路由统一改为 `let body; try { body = await req.json() } catch { return 400 }` 模式，恶意或格式错误的请求体返回 400 而非触发 500。

---

### B 组：`normalizeCreatorPlatform` 空字符串守卫（2 项）

| ID | 文件 | 状态 |
|----|------|------|
| B1 | `api/creators/route.ts` — POST `platform` 字段 | ✅ |
| B2 | `api/creators/[id]/route.ts` — PATCH `platform` 字段 | ✅ |

**修复方式**：`typeof platform === 'string' && platform.trim() ? normalizeCreatorPlatform(platform.trim()) : ''`

---

### C 组：UI loading 状态卡死（finally 缺失）（3 项）

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| C1 | `ExpenseForm.submit()` 网络异常时 `setLoading(false)` 不执行 | `ExpenseForm.tsx` | ✅ |
| C2 | `createBroadcastAccount()` 网络异常时 `setCreatingBroadcast(false)` 不执行 | `CreatorForm.tsx` | ✅ |
| C3 | `handleStatusChange()` 网络异常时 `setStatusBusy(false)` 不执行 | `timeline/[id]/page.tsx` | ✅ |

**修复方式**：统一 `try/catch/finally`，loading 重置移入 `finally`。

---

### D 组：`handleExecuteTask` 无错误处理（1 项）

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| D1 | 网络异常时 `setExecuting(null)` 不执行，按钮永久 loading | `timeline/[id]/page.tsx` | ✅ |

**修复方式**：`try/catch/finally`，`setExecuting(null)` 移入 `finally`。

---

### E 组：无 `res.ok` 检查即执行导航/回调（2 项）

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| E1 | `handleDelete` DELETE 失败仍 `router.push('/timeline')` | `timeline/[id]/page.tsx` | ✅ |
| E2 | ListView `handleDelete` DELETE 失败仍调用 `onUpdated()` | `timeline/page.tsx` | ✅ |

**修复方式**：`const res = await fetch(...); if (res.ok) router.push(...)` / `if (res.ok) onUpdated()`

---

### F 组：按钮缺少 `type="button"`（3 项）

| ID | 位置 | 状态 |
|----|------|------|
| F1 | 支出页面"重置筛选"按钮 | ✅ |
| F2 | 支出页面"添加第一条支出"按钮 | ✅ |
| F3 | Timeline 列表"Delete"按钮 | ✅ |

**修复方式**：添加 `type="button"` 防止在表单上下文中意外触发 submit。

---

### G 组：常量硬编码 + `res.ok` 遗漏（2 项）

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| G1 | 详情页 `daysLeft <= 7` 应使用 `AT_RISK_DAYS` | `timeline/[id]/page.tsx` | ✅ |
| G2 | `handleStatusChange` 缺少 `res.ok` 检查，失败时仍更新 UI | `timeline/[id]/page.tsx` | ✅ |

**修复方式**：import `AT_RISK_DAYS`；`if (res.ok && json.data) setMilestone(...)`

---

### H 组：图标专按钮缺少 `aria-label`（2 项）

| ID | 问题描述 | 文件 | 状态 |
|----|---------|------|------|
| H1 | 财务预测"删除行"按钮仅含 `<Trash2>` 图标，无 aria-label | `FinanceForecastDashboard.tsx` | ✅ |
| H2 | Modal 关闭按钮仅含 `<X>` 图标，无 aria-label / type | `Modal.tsx` | ✅ |

**修复方式**：添加 `aria-label="Delete row"` / `aria-label="Close" type="button"`

---

## 关键修复逻辑说明

### EX-M1：`categoryHasPeriod` 逻辑错误（高影响）
```ts
// 修复前：对所有合法分类均返回 true（等同于"是否是有效分类"）
return EXPENSE_CATEGORY_OPTIONS.some((option) => option.value === cat)

// 修复后：仅周期性费用显示归属期字段
return cat === 'salary' || cat === 'rent' || cat === 'cloud_services'
```
**影响**：修复前，`tangible_asset`（有形资产）、`travel`（差旅费）、`office_supplies`（办公耗材）均会显示"归属期"字段，该字段对这三类无意义。

---

### FC-M2：`margin_pct` 类型变更
```ts
// 修复前
margin_pct: number   // 零收入时返回 0，显示 "0%"

// 修复后
margin_pct: number | null   // 零收入时返回 null，显示 "N/A"
```

---

### EX-M3 + M5：AbortController + 防抖组合
```ts
// 防抖：搜索 300ms 后才更新 filters.q → 触发 load()
useEffect(() => {
  const timer = window.setTimeout(() => setFilters(f => ({ ...f, q: searchInput })), 300)
  return () => window.clearTimeout(timer)
}, [searchInput])

// AbortController：filters 变化时取消上一次未完成的请求
const ctrl = new AbortController()
loadCtrl.current = ctrl
const res = await fetch(url, { signal: ctrl.signal })
```

---

### API 路由 req.json() 统一守卫模式（A 组 7 条路由）
```ts
// 修复前（所有路由）
const body = await req.json()  // malformed JSON → 500

// 修复后
let body: Record<string, unknown>
try {
  body = await req.json()
} catch {
  return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
}
```

---

### UI 异步操作统一 finally 模式（C/D 组 4 处）
```ts
// 修复前（典型）
setLoading(true)
const res = await fetch(...)     // 若此处抛出，setLoading(false) 永远不执行
const json = await res.json()
setLoading(false)

// 修复后
setLoading(true)
try {
  const res = await fetch(...)
  const json = await res.json()
  if (!res.ok || json.error) { setError(...); return }
  onSuccess()
} catch {
  setError(tCommon('loadFailed'))
} finally {
  setLoading(false)   // 无论成功、失败、异常，必定执行
}
```

---

## 验证结果

```
npm run build   ✅  Compiled successfully (0 TypeScript errors)
npm test        ✅  52 / 52 tests pass

修改文件汇总（Critical + Medium + Minor，共 25 个文件 + 2 个新增文件）：

  — Critical / Medium 修改 —
  src/app/api/broadcast-accounts/route.ts
  src/app/[locale]/(app)/creators/page.tsx
  src/app/[locale]/(app)/finance-forecast/page.tsx
  src/components/milestones/MilestoneForm.tsx
  src/lib/expenses/costs.ts
  src/lib/expenses/costs.test.ts        ← 更新测试以反映正确行为
  src/lib/finance-forecast/calculations.ts
  src/lib/milestones/auto-tasks.ts
  src/lib/milestones/constants.ts       ← 新增（AT_RISK_DAYS 常量）
  src/lib/currency-rates.ts             ← 新增（CNY/USD 汇率单一来源）
  messages/zh.json
  messages/en.json

  — Minor 新增修改 —
  src/app/api/creators/route.ts
  src/app/api/creators/[id]/route.ts
  src/app/api/expenses/route.ts
  src/app/api/expenses/[id]/route.ts
  src/app/api/milestones/route.ts
  src/app/api/milestones/[id]/route.ts
  src/app/api/finance-forecast/route.ts
  src/app/[locale]/(app)/expenses/page.tsx
  src/app/[locale]/(app)/timeline/page.tsx
  src/app/[locale]/(app)/timeline/[id]/page.tsx
  src/components/creators/CreatorForm.tsx
  src/components/expenses/ExpenseForm.tsx
  src/components/finance-forecast/FinanceForecastDashboard.tsx
  src/components/ui/Modal.tsx
```

---

## 待手动验证（需浏览器）

以下逻辑变更无法通过单元测试覆盖，建议在浏览器中各抽查一遍：

| 场景 | 预期结果 | 相关修复 |
|------|---------|---------|
| 支出表单切换到"有形资产"类别 | "归属期"字段**不显示** | EX-M1 |
| 支出表单切换到"薪资成本"类别 | "归属期"字段**显示** | EX-M1 |
| 支出表单数量填 `-1` 或 `0` 后提交 | 表单提示"数量必须是正整数" | EX-M5 |
| 关闭创作者表单后重新打开 | 所有字段已清空 | C2 |
| 新建直播账号子表单打开 | 平台已预填为创作者当前选中平台 | M2 |
| 财务预测空月份 KPI | 毛利率显示 **N/A**（不显示 0%） | FC-M2 |
| 快速连续点击"添加账号" | 每行 ID 均唯一（不同 row 显示不同内容） | FC-M5 |
| 支出详情页"删除"按钮断网时点击 | 按钮恢复可点击（不卡死） | EX-M4, C1 |
| Timeline 里程碑状态切换断网时 | 按钮恢复可点击，状态不变 | C3, G2 |
| Timeline 里程碑详情页点击"Delete"失败 | 页面不跳转 | E1 |
| Timeline 列表点击"Delete"失败 | 列表不刷新 | E2 |
| 向 API 发送 `Content-Type: application/json` 但 body 为乱码 | 返回 400，而非 500 | A 组 |
| 创建直播账号时平台传空字符串 | 返回 400（参数校验失败） | B 组 |
| 财务预测"删除行"按钮 | 屏幕阅读器可识别（aria-label） | H1 |
| Modal 关闭按钮 | 屏幕阅读器可识别（aria-label） | H2 |
