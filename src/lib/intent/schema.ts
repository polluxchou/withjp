import { z } from 'zod'

// ── Enum echoes (mirror src/lib/types) ─────────────────────────
// Kept inline so this module has no runtime dep on the rest of the
// app and can be reused by Gemini schema generation.

export const ExpenseCategoryEnum = z.enum([
  'tangible_asset', 'salary', 'rent', 'travel', 'office_supplies', 'cloud_services',
])

export const ExpensePaymentMethodEnum = z.enum([
  'company_account', 'wechat_pay', 'alipay', 'bank_card',
])

export const ExpensePaymentStatusEnum = z.enum([
  'budgeted', 'ordered_unpaid', 'paid', 'refunded', 'partially_refunded',
])

// ── Filters shared by query / targetMatch ──────────────────────

// period is stored as 'YYYY-QN' (quarter) per migration 013.
const PERIOD_RE = /^\d{4}-Q[1-4]$/

export const ExpenseFiltersSchema = z.object({
  expense_category:    z.array(ExpenseCategoryEnum).optional(),
  period_in:           z.array(z.string().regex(PERIOD_RE)).optional(),
  date_range:          z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).optional(),
  payment_status:      z.array(ExpensePaymentStatusEnum).optional(),
  payment_method:      z.array(ExpensePaymentMethodEnum).optional(),
  user_name_contains:  z.string().min(1).optional(),
  buyer_name_contains: z.string().min(1).optional(),
  item_name_contains:  z.string().min(1).optional(),
  purpose_contains:    z.string().min(1).optional(),
}).strict()

export type ExpenseFilters = z.infer<typeof ExpenseFiltersSchema>

// ── Write payload (matches expenses table) ────────────────────

export const ExpenseWritePayloadSchema = z.object({
  expense_category: ExpenseCategoryEnum.optional(),
  item_name:        z.string().min(1).optional(),
  unit_price:       z.number().nonnegative().optional(),
  quantity:         z.number().int().positive().optional(),
  expense_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period:           z.string().regex(PERIOD_RE).nullable().optional(),
  location:         z.string().optional(),
  purpose:          z.string().optional(),
  user_name:        z.string().optional(),
  buyer_name:       z.string().optional(),
  payment_method:   ExpensePaymentMethodEnum.nullable().optional(),
  payment_status:   ExpensePaymentStatusEnum.optional(),
  notes:            z.string().nullable().optional(),
}).strict()

export type ExpenseWritePayload = z.infer<typeof ExpenseWritePayloadSchema>

// ── Create / Update / Delete intent ───────────────────────────

export const ExpenseCreateIntentSchema = z.object({
  op:         z.literal('create'),
  entity:     z.literal('expense'),
  payload:    ExpenseWritePayloadSchema,
  summary:    z.string().min(1),
  ambiguities: z.array(z.string()).optional(),
}).strict()

export const ExpenseUpdateIntentSchema = z.object({
  op:     z.literal('update'),
  entity: z.literal('expense'),
  targetMatch: z.object({
    id:      z.string().uuid().optional(),
    filters: ExpenseFiltersSchema.optional(),
  }).refine(v => !!v.id || !!v.filters, { message: 'targetMatch requires id or filters' }),
  patch:   ExpenseWritePayloadSchema,
  summary: z.string().min(1),
  ambiguities: z.array(z.string()).optional(),
}).strict()

export const ExpenseDeleteIntentSchema = z.object({
  op:     z.literal('delete'),
  entity: z.literal('expense'),
  targetMatch: z.object({
    id:      z.string().uuid().optional(),
    filters: ExpenseFiltersSchema.optional(),
  }).refine(v => !!v.id || !!v.filters, { message: 'targetMatch requires id or filters' }),
  summary: z.string().min(1),
  ambiguities: z.array(z.string()).optional(),
}).strict()

// ── Query intent ──────────────────────────────────────────────

export const ExpenseQueryIntentSchema = z.object({
  op:       z.literal('query'),
  entity:   z.literal('expense'),
  filters:  ExpenseFiltersSchema,
  aggregate: z.enum(['sum_total', 'count', 'avg_total', 'list']),
  groupBy:  z.enum([
    'expense_category', 'period', 'user_name', 'buyer_name', 'payment_method',
  ]).optional(),
  ratioOf:  z.object({ filters: ExpenseFiltersSchema }).optional(),
  limit:    z.number().int().positive().max(500).optional(),
  breadcrumbs: z.string().min(1),
}).strict()

// ── Discriminated union ───────────────────────────────────────

export const ExpenseIntentSchema = z.discriminatedUnion('op', [
  ExpenseCreateIntentSchema,
  ExpenseUpdateIntentSchema,
  ExpenseDeleteIntentSchema,
  ExpenseQueryIntentSchema,
])

export type ExpenseCreateIntent = z.infer<typeof ExpenseCreateIntentSchema>
export type ExpenseUpdateIntent = z.infer<typeof ExpenseUpdateIntentSchema>
export type ExpenseDeleteIntent = z.infer<typeof ExpenseDeleteIntentSchema>
export type ExpenseQueryIntent  = z.infer<typeof ExpenseQueryIntentSchema>
export type ExpenseIntent       = z.infer<typeof ExpenseIntentSchema>

export type ExpenseWriteIntent =
  | ExpenseCreateIntent
  | ExpenseUpdateIntent
  | ExpenseDeleteIntent

export function isWriteIntent(intent: ExpenseIntent): intent is ExpenseWriteIntent {
  return intent.op === 'create' || intent.op === 'update' || intent.op === 'delete'
}
