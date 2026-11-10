import type { Enums, Tables } from '@/lib/supabase/database.types'

// 数据库 enum 与示范域（expenses）的行类型从生成的 database.types.ts 派生
// （npm run gen:types）。库里改了 enum 或列，这里自动跟着变，编译器会指出受影响的代码。
// 其余接口仍是手写，逐域迁移的清单见 PR 描述。

// ── Creator ───────────────────────────────────────────────────

export type CreatorStatus = Enums<'creator_status'>

export interface CreatorContactInfo {
  email?: string
  phone?: string
  wechat?: string
  social_handle?: string
}

export interface CreatorProfile {
  platform_id?: string
  niche?: string
  followers?: number
  avg_views?: number
  language?: string
  location?: string
}

export interface Creator {
  id: string
  name: string
  platform: string
  status: CreatorStatus
  broadcast_account_id: string | null
  operator_user_id: string | null
  created_by_user_id: string | null
  contact_info: CreatorContactInfo
  profile: CreatorProfile
  notes?: string
  created_at: string
  updated_at: string
  // joined via query
  broadcast_account?: BroadcastAccount | null
  operator_user?: Pick<UserProfile, 'id' | 'name' | 'email' | 'user_code' | 'role'> | null
  tasks?: Task[]
  finance?: Finance[]
}

// ── Broadcast Account ────────────────────────────────────────

export interface BroadcastAccount {
  id: string
  name: string
  platform: string
  account_handle: string
  account_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Agent ─────────────────────────────────────────────────────

// DB enum agent_role 全量 8 值（迁移 001/003/010/016 累计添加）：
// bd/ops/finance/content/growth/legal 是真人可选部门角色；'tech' 是新增的
// 真人可选角色（真人技术岗）；'pmo' 是 AI 代理专属角色（PMO Agent 自身的
// role，不出现在任何真人可选角色下拉——见 ProfileEditor 的 ROLES 数组）。
export type AgentRole = Enums<'agent_role'>
export type ModelProvider = 'anthropic' | 'openai' | 'gemini'

export interface Agent {
  id: string
  name: string
  role: AgentRole
  responsibility: string
  input_schema: Record<string, string>
  output_schema: Record<string, string>
  prompt_template: string
  is_active: boolean
  chat_enabled: boolean
  created_at: string
  model_provider: ModelProvider | null
  model_name: string | null
}

// ── Task ──────────────────────────────────────────────────────

export type TaskStatus = Enums<'task_status'>

export interface Task {
  id: string
  creator_id: string
  agent_id: string
  title: string
  status: TaskStatus
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  next_action: string | null
  parent_task_id: string | null
  created_at: string
  updated_at: string
  // joined via query
  creator?: Pick<Creator, 'id' | 'name' | 'platform' | 'status'>
  agent?: Pick<Agent, 'id' | 'name' | 'role'>
}

// ── Finance ───────────────────────────────────────────────────

export interface Finance {
  id: string
  creator_id: string
  revenue: number
  cost: number
  profit: number
  roi: number
  period: string
  notes?: string
  created_at: string
  // joined
  creator?: Pick<Creator, 'id' | 'name' | 'platform'>
}

// ── Knowledge ─────────────────────────────────────────────────

export type KnowledgeCategory = Enums<'knowledge_category'>

export interface Knowledge {
  id: string
  category: KnowledgeCategory
  title: string
  content: string
  tags: string[]
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

// ── Config ────────────────────────────────────────────────────

export interface Config {
  id: string
  key: string
  value: Record<string, unknown>
  description: string
  updated_at: string
}

// ── Lifecycle Transition ──────────────────────────────────────

export interface LifecycleTransition {
  id: string
  creator_id: string
  from_status: CreatorStatus
  to_status: CreatorStatus
  triggered_at: string
  triggered_by: string
  notes?: string
}

// ── API Response wrappers ─────────────────────────────────────

export interface ApiOk<T> {
  data: T
  error: null
}
export interface ApiError {
  data: null
  error: string
}
export type ApiResponse<T> = ApiOk<T> | ApiError

// ── Dashboard Stats ───────────────────────────────────────────

export interface DashboardStats {
  total_creators: number
  creators_by_status: Record<CreatorStatus, number>
  total_revenue: number
  total_profit: number
  avg_roi: number
  pending_tasks: number
  running_tasks: number
  done_tasks: number
  profitable_creators: number
}

// ── Milestone ─────────────────────────────────────────────────

export type MilestoneType     = Enums<'milestone_type'>
export type MilestoneLevel    = Enums<'milestone_level'>
export type MilestoneStatus   = Enums<'milestone_status'>
export type MilestonePriority = Enums<'milestone_priority'>
export type RiskLevel         = Enums<'risk_level'>

export interface Milestone {
  id: string
  title: string
  description: string | null
  type: MilestoneType
  level: MilestoneLevel
  owner_agent_id: string | null
  involved_agent_ids: string[]
  linked_creator_ids: string[]
  linked_task_ids: string[]
  parent_milestone_id: string | null
  start_date: string
  target_date: string
  /** 实际完成日期。非空 ⇔ status === 'completed'（见 lib/milestones/completion.ts）。 */
  completed_date: string | null
  status: MilestoneStatus
  priority: MilestonePriority
  success_metric: Record<string, unknown>
  risk_level: RiskLevel
  notes: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
  // joined / computed — optional, present in API responses
  owner_agent?: Pick<Agent, 'id' | 'name' | 'role'> | null
  children?: Milestone[]
  days_until_target?: number
}

export interface MilestoneDetail extends Milestone {
  task_progress: { done: number; total: number }
  involved_agents: Pick<Agent, 'id' | 'name' | 'role'>[]
  linked_tasks: {
    id: string
    title: string
    status: TaskStatus
    creator: Pick<Creator, 'id' | 'name'> | null
    agent: Pick<Agent, 'id' | 'name' | 'role'> | null
  }[]
  linked_creators: Pick<Creator, 'id' | 'name' | 'platform' | 'status'>[]
}

// ── Conversation ──────────────────────────────────────────────

export interface Conversation {
  id: string
  agent_id: string
  title: string | null
  created_at: string
  updated_at: string
  // joined
  agent?: Pick<Agent, 'id' | 'name' | 'role'>
}

// ── Conversation Message ──────────────────────────────────────

export type SenderType = 'user' | 'agent'

export interface ConversationMessage {
  id: string
  conversation_id: string
  sender_type: SenderType
  agent_id: string | null
  content: string
  created_at: string
}

// ── Creator Activity Log ──────────────────────────────────

export type ActivityType = Enums<'activity_type'>

export interface CreatorActivityLog {
  id: string
  creator_id: string
  activity_type: ActivityType
  title: string
  description: string | null
  metadata: Record<string, unknown>
  actor: string
  created_at: string
}

// ── PMO Activity Stream (migration 010) ───────────────────

export type ActivityActorType = Enums<'activity_actor_type'>

export type ActivityAction = Enums<'activity_action'>

export type ActivityEntity = Enums<'activity_entity'>

export interface ActivityEvent {
  id:             string
  actor_type:     ActivityActorType
  actor_user_id:  string | null
  actor_agent_id: string | null
  entity_type:    ActivityEntity
  entity_id:      string
  action:         ActivityAction
  before:         Record<string, unknown> | null
  after:          Record<string, unknown> | null
  diff:           Record<string, unknown> | null
  content:        string | null
  context:        Record<string, unknown>
  created_at:     string
  archived_at:    string | null
}

export interface PmoInstance {
  id:              string
  name:            string
  description:     string | null
  agent_id:        string
  filter_config:   Record<string, unknown>
  reminder_config: Record<string, unknown>
  is_active:       boolean
  created_at:      string
  updated_at:      string
}

// ── Device (legacy — kept for backward compat) ────────────────

export type DevicePaymentStatus =
  | 'budgeted'
  | 'ordered_unpaid'
  | 'paid'
  | 'refunded'
  | 'partially_refunded'

export interface Device {
  id:                string
  device_name:       string
  unit_price:        number
  quantity:          number
  total_price:       number
  purchase_date:     string
  purchase_location: string
  purchase_purpose:  string
  user_name:         string
  buyer_name:        string
  payment_method:    string
  payment_status:    DevicePaymentStatus
  created_at:        string
  updated_at:        string
}

// ── Expense ───────────────────────────────────────────────────

export type ExpenseCategory = Enums<'expense_category'>

export type ExpensePaymentMethod = Enums<'expense_payment_method'>

// payment_status 在库里是 text + check 约束（expenses_payment_status_valid），不是 enum，
// 生成的类型只给 string，所以取值清单仍手写；与约束对齐由 lib/expenses/row.ts 在读取时把关。
export type ExpensePaymentStatus =
  | 'budgeted'
  | 'ordered_unpaid'
  | 'paid'
  | 'refunded'
  | 'partially_refunded'

// Buyer options when payment_method === 'company_account'
export const COMPANY_ACCOUNT_BUYERS = ['with-new', 'JP-代理陈昊', 'JP-代理小兽', 'JP-陈昊投资'] as const
export type CompanyAccountBuyer = typeof COMPANY_ACCOUNT_BUYERS[number]

// expenses 表的一行（示范域：从生成的行类型派生）。两处比库里更窄：
//   payment_status — 库里 text + check 约束，这里收窄成 ExpensePaymentStatus；
//   total_price    — 生成列 unit_price * quantity（两者 not null），introspection 只能报
//                    可空，这里按非空。两处都由 lib/expenses/row.ts 的 toExpense 在读取时核对。
// period 形如 '2026-Q1'，由 expense_date 推导；payment_method_legacy 保留旧的自由文本。
export type Expense = Omit<Tables<'expenses'>, 'payment_status' | 'total_price'> & {
  payment_status: ExpensePaymentStatus
  total_price:    number
}

// ── User Profile ──────────────────────────────────────────

export interface UserProfile {
  id: string
  name: string
  role: AgentRole
  email: string | null
  user_code: string
  is_admin: boolean
  avatar_url?: string
  created_at: string
  updated_at: string
  /** 来自 Auth app_metadata，不是 users 表的列；null = 普通成员。见 auth/access-scope.ts。 */
  access_scope?: string | null
}

// ── User Salary ───────────────────────────────────────────

export interface UserSalary {
  id:             string
  user_id:        string
  monthly_salary: number
  effective_from: string   // date string YYYY-MM-DD
  effective_to:   string | null
  notes:          string | null
  created_at:     string
  // joined
  user?: Pick<UserProfile, 'id' | 'name' | 'user_code' | 'role'>
}

// ── Work Task ─────────────────────────────────────────────

export type WorkTaskType           = Enums<'work_task_type'>
export type WorkTaskStatus         = Enums<'work_task_status'>
export type WorkTaskEffort         = 2 | 4 | 8
export type WorkTaskRepeatInterval = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export const WORK_TASK_EFFORT_OPTIONS: WorkTaskEffort[] = [2, 4, 8]

// Labels live in messages/*.json under workTasks.repeat
export const WORK_TASK_REPEAT_INTERVAL_OPTIONS: WorkTaskRepeatInterval[] = ['daily', 'weekly', 'biweekly', 'monthly']

export interface WorkTask {
  id:                   string
  task_type:            WorkTaskType
  title:                string
  description:          string | null
  department:           AgentRole
  milestone_id:         string | null
  owner_user_id:        string
  reviewer_user_id:     string | null
  executor_ids:         string[]
  task_date:            string        // YYYY-MM-DD
  due_date:             string | null // deadline
  effort_hours:         WorkTaskEffort
  repeat_interval:      WorkTaskRepeatInterval | null
  completion_criteria:  string | null
  status:               WorkTaskStatus
  notes:                string | null
  business_task_item_id:   string | null
  business_task_item_name: string | null
  created_at:           string
  updated_at:           string
  // joined
  owner?:     Pick<UserProfile, 'id' | 'name' | 'user_code' | 'role'>
  reviewer?:  Pick<UserProfile, 'id' | 'name' | 'user_code' | 'role'> | null
  milestone?: { id: string; title: string } | null
}

// Workload computed per user per date
export interface UserWorkload {
  user_id:      string
  user_name:    string
  user_code:    string
  department:   AgentRole
  total_hours:  number
  tasks:        WorkTask[]
  daily_cost:   number   // computed from salary
}

// ── Org Structure (业务分工) ──────────────────────────────

export type MemberType = 'user' | 'creator'

// 统一"人引用"：二选一
export interface PersonRef {
  member_type: MemberType
  user_id: string | null
  creator_id: string | null
}

export interface Position {
  id: string
  key: string
  name: string
  description: string
  sort_order: number
}

export interface PositionMember extends PersonRef {
  id: string
  position_id: string
  // joined 展示名（service 拼装）
  display_name?: string
}

export type TaskItemStatus = 'todo' | 'doing' | 'blocked' | 'done'

export interface TaskItem {
  id: string
  task_id: string
  name: string
  sort_order: number
  owner_member_type: MemberType | null
  owner_user_id: string | null
  owner_creator_id: string | null
  owner_name?: string | null   // joined
  is_important: boolean | null // 重要；null = 待评估
  due_date: string | null      // 截止日 'YYYY-MM-DD'（date 列）
  status: TaskItemStatus
}

export interface BusinessTask {
  id: string
  business_id: string
  name: string
  sort_order: number
  position_ids: string[]       // 关联岗位（service 拼装）
  items: TaskItem[]            // 事项（service 拼装）
}

export interface Business {
  id: string
  key: string
  name: string
  sort_order: number
  owner_member_type: MemberType | null
  owner_user_id: string | null
  owner_creator_id: string | null
  owner_name?: string | null   // joined
  tasks: BusinessTask[]        // service 拼装
}

// 选人候选：员工 + 主播
export interface PersonOption {
  member_type: MemberType
  id: string        // user_id 或 creator_id
  name: string
}

// GET /api/org 的整包返回
export interface OrgSnapshot {
  businesses: Business[]
  positions: (Position & { members: PositionMember[] })[]
  people: PersonOption[]       // 候选人（选负责人/配岗位成员用）
  canEdit: boolean
}
