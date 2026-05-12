// ── Creator ───────────────────────────────────────────────────

export type CreatorStatus =
  | 'prospect'
  | 'contacted'
  | 'engaged'
  | 'onboarded'
  | 'live_ready'
  | 'live'
  | 'monetized'
  | 'terminated'

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

export type AgentRole = 'bd' | 'ops' | 'finance' | 'content' | 'growth' | 'legal'
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

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

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

export type KnowledgeCategory =
  | 'outreach_scripts'
  | 'onboarding_materials'
  | 'live_strategies'
  | 'objection_handling'

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

export type MilestoneType     = 'campaign' | 'launch' | 'recruitment' | 'finance' | 'review'
export type MilestoneLevel    = 'company' | 'department' | 'creator'
export type MilestoneStatus   = 'planned' | 'active' | 'at_risk' | 'completed' | 'missed'
export type MilestonePriority = 'high' | 'medium' | 'low'
export type RiskLevel         = 'low' | 'medium' | 'high'

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

export type ActivityType =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'task_created'
  | 'task_completed'
  | 'finance_logged'
  | 'note_added'
  | 'contact_updated'
  | 'profile_updated'
  | 'other'

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

export type ActivityActorType = 'user' | 'agent' | 'system'

export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'execute'
  | 'message_sent'
  | 'message_received'

export type ActivityEntity =
  | 'creator'
  | 'task'
  | 'milestone'
  | 'finance'
  | 'device'
  | 'conversation'
  | 'broadcast_account'
  | 'user'
  | 'knowledge'
  | 'agent'

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

export type ExpenseCategory =
  | 'tangible_asset'
  | 'salary'
  | 'rent'
  | 'travel'
  | 'office_supplies'
  | 'cloud_services'

export type ExpensePaymentMethod =
  | 'company_account'
  | 'wechat_pay'
  | 'alipay'
  | 'bank_card'

export type ExpensePaymentStatus =
  | 'budgeted'
  | 'ordered_unpaid'
  | 'paid'
  | 'refunded'
  | 'partially_refunded'

// Buyer options when payment_method === 'company_account'
export const COMPANY_ACCOUNT_BUYERS = ['with-new', 'JP-代理陈昊', 'JP-代理小兽', 'JP-陈昊投资'] as const
export type CompanyAccountBuyer = typeof COMPANY_ACCOUNT_BUYERS[number]

export interface Expense {
  id:                    string
  expense_category:      ExpenseCategory
  item_name:             string
  unit_price:            number
  quantity:              number
  total_price:           number
  expense_date:          string
  location:              string
  purpose:               string
  period:                string | null       // e.g. '2026-Q1', derived from expense_date
  user_name:             string
  buyer_name:            string
  payment_method:        ExpensePaymentMethod | null
  payment_method_legacy: string | null       // preserved old free-text value
  payment_status:        ExpensePaymentStatus
  notes:                 string | null
  created_by_user_id:    string | null
  created_at:            string
  updated_at:            string
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

export type WorkTaskType   = 'fixed' | 'adhoc'
export type WorkTaskStatus = 'planned' | 'doing' | 'done' | 'cancelled'
export type WorkTaskEffort = 2 | 4 | 8

export const WORK_TASK_EFFORT_OPTIONS: WorkTaskEffort[] = [2, 4, 8]

export interface WorkTask {
  id:            string
  task_type:     WorkTaskType
  title:         string
  description:   string | null
  department:    AgentRole
  milestone_id:  string | null
  owner_user_id: string
  executor_ids:  string[]
  task_date:     string        // date string YYYY-MM-DD
  effort_hours:  WorkTaskEffort
  status:        WorkTaskStatus
  notes:         string | null
  created_at:    string
  updated_at:    string
  // joined
  owner?:        Pick<UserProfile, 'id' | 'name' | 'user_code' | 'role'>
  milestone?:    { id: string; title: string } | null
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
