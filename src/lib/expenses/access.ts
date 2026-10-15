// 成本管理 › 支出管理只对管理员开放（2026-10-15 起）。读、写一起收：支出
// 里有薪资、房租等分类，明细本身就是敏感数据，不只是「改」才敏感。
//
// 这是唯一的判据，下面这些入口都调它，不各写一份 is_admin：
//   - /api/expenses*、/api/expense-saved-views* 的每个 handler（403）
//   - 命令面板的支出意图：executeIntent 与 applyPendingAction 的支出分支
//   - /expenses 页面（layout.tsx 服务端拦截）与侧边栏入口（adminOnly）
//
// 不在范围内：财务预测按月汇总的预算成本（服务端直接读 expenses 表做聚合，
// 不暴露明细），以及物品/场地页按 expense_id 展示的关联金额——非管理员在那
// 两页拿不到支出列表，关联金额就不显示。

export interface ExpenseAccessActor {
  is_admin: boolean
}

export function canAccessExpenses(actor: ExpenseAccessActor | null | undefined): boolean {
  return actor?.is_admin === true
}

export const EXPENSES_ADMIN_ONLY_MESSAGE = '支出管理仅限管理员访问'
