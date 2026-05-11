# 支出管理变更说明

日期：2026-05-11

这份说明用于 2026-05-12 给 Claude 继续查看当前支出管理模块的改动。

## 1. 类别占比改为交互式饼图

状态：已提交并推送到 GitHub `main`

提交：

```text
bcea844 feat(expenses): add interactive category pie chart
```

改动内容：

- 将支出管理里的“类别占比”从横向进度条改为 Recharts 饼图。
- 饼图扇区可点击，点击某个类别后会联动下方支出明细列表进行类别筛选。
- 右侧类别图例也可点击，行为与点击饼图扇区一致。
- 再次点击当前已选类别会取消筛选。
- 饼图保持展示当前非类别筛选条件下的完整类别分布，当前选中类别会高亮。
- KPI 与下方明细列表使用当前类别筛选后的数据。

主要文件：

- `src/components/expenses/ExpenseCategoryChart.tsx`
- `src/app/[locale]/(app)/expenses/page.tsx`
- `src/lib/expenses/category-filter.ts`
- `src/lib/expenses/category-filter.test.ts`
- `package.json`

验证：

```text
npm test -> 45 pass
npm run build -> passed
npm run test:i18n -> passed
git diff --check -> passed
```

注意：

- 浏览器验证时页面会重定向到登录页，因登录表单已有已填邮箱/密码，未代替用户点击登录。

## 2. 所有支出明细增加“归属周期”

状态：随本次主版本提交推送到 GitHub `main`

改动内容：

- 原先 `归属周期 period` 只对 `salary`、`rent`、`cloud_services` 显示和保存。
- 现在改为所有支出类别都显示“归属周期”。
- 新增/编辑表单会对所有类别展示“归属周期”，并按 `expense_date` 自动推导为季度格式 `YYYY-QN`。
- 支出详情弹窗会对所有类别展示“归属周期”。
- 后端创建支出时也会对所有类别自动推导 `period`。
- 更新 intent/parser 与类型注释，去掉“只对 salary/rent/cloud_services 生效”的旧描述。
- 新增数据库迁移，用于把历史记录中缺失或非季度格式的 `period` 按 `expense_date` 回填为 `YYYY-QN`。

主要文件：

- `src/lib/expenses/costs.ts`
- `src/lib/expenses/costs.test.ts`
- `src/lib/expenses/service.ts`
- `src/lib/intent/parser.ts`
- `src/lib/types/index.ts`
- `supabase/migrations/015_backfill_all_expense_periods.sql`
- `package.json`

验证：

```text
npm test -> 46 pass
npm run build -> passed
npm run test:i18n -> passed
git diff --check -> passed
```

待 Claude 或后续操作者确认：

- 部署或数据库环境是否需要执行 `supabase/migrations/015_backfill_all_expense_periods.sql`。

## 3. 文字操作提交后刷新支出列表

状态：随本次主版本提交推送到 GitHub `main`

改动内容：

- 通过“用文字操作”确认新增、修改或删除支出后，页面会广播 `intent:applied` 事件。
- 支出管理页面监听该事件后会清空当前筛选条件，并重新拉取 `/api/expenses`。
- 用户确认文字操作后，不需要手动刷新页面，就能看到最新的全部支出明细。

主要文件：

- `src/components/intent/CommandBar.tsx`
- `src/app/[locale]/(app)/expenses/page.tsx`
- `src/lib/intent/events.ts`
- `src/lib/intent/events.test.ts`
- `package.json`

验证：

```text
npm test -> 48 pass
npm run build -> passed
npm run test:i18n -> passed
git diff --check -> passed
```

## 当前工作区提示

本说明随当前工作区改动一起提交后，`main` 应与 `origin/main` 对齐。

本次提交预期包含：

```text
M  package.json
M  src/app/[locale]/(app)/expenses/page.tsx
M  src/components/intent/CommandBar.tsx
M  src/lib/expenses/costs.ts
M  src/lib/expenses/service.ts
M  src/lib/intent/parser.ts
M  src/lib/types/index.ts
?? src/lib/expenses/costs.test.ts
?? src/lib/intent/events.ts
?? src/lib/intent/events.test.ts
?? supabase/migrations/015_backfill_all_expense_periods.sql
?? docs/daily/2026-05-11-expense-management-change-notes.md
```
