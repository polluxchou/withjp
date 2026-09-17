// 支出明细列表的排序与分组。
//
// 列表页原来把日期、归属周期、类别、记录 ID 平铺在每一行的 meta 里，同一天
// 的记录会把同样的日期印好几遍。这里把"天"提升成分组维度，日期只在组头出现
// 一次，组头顺带给出当天的笔数与小计——小计本来就要算，正好接回曾经存在过
// 的每日告警线（见 DAILY_ALERT_THRESHOLD）。
//
// 纯函数，不碰 React 也不读时钟：当前年份由调用方传入，测试才能钉住跨年行为。

export type ExpenseSortKey = 'date' | 'amount'
export type ExpenseSortDir = 'asc' | 'desc'

/**
 * 单日支出到这条线就要向投资方说明。数值和图表里那条早已被拆掉、只剩文案
 * （expenses.dailyAlert100k）的每日告警线同源，但两边各自持有——组头的提示语
 * 是完整句子，不是图例标签，硬共用一条文案只会让两处都别扭。
 */
export const DAILY_ALERT_THRESHOLD = 100_000

/** 分组只需要这几个字段，Expense 的其余部分由调用方的泛型带过去。 */
export interface GroupableExpense {
  id: string
  expense_date: string
  total_price: number | string
  buyer_name?: string | null
  created_at?: string | null
}

export interface ExpenseGroup<T> {
  /** 稳定键：按天是日期本身，按人是 buyer: 前缀加姓名。 */
  key: string
  /** 组头文案。未指定经办人的组给空串，由调用方用 i18n 文案渲染。 */
  label: string
  rows: T[]
  count: number
  total: number
  /** 只有一条时小计等于那一行的金额，是纯复读，不展示。 */
  showTotal: boolean
  /** 仅按天分组时可能为真——阈值是"单日"口径，不适用于人。 */
  overThreshold: boolean
  /** 该组收容的是没有经办人的记录。 */
  unassigned: boolean
}

/** total_price 从 Supabase 回来可能是 numeric 字符串。 */
function amountOf(e: GroupableExpense): number {
  return Number(e.total_price) || 0
}

function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 同额（或同日）时的固定收尾：晚的在前，再不行按 created_at 稳定下来。 */
function recencyFirst(a: GroupableExpense, b: GroupableExpense): number {
  return cmp(b.expense_date, a.expense_date) || cmp(b.created_at ?? '', a.created_at ?? '')
}

/**
 * 按金额从大到小。组内顺序与排序方向无关——组头已经表达了方向，组内再翻一次
 * 只会让"这天最大的一笔"每次都换位置。
 */
function byAmountDesc<T extends GroupableExpense>(rows: T[]): T[] {
  return [...rows].sort((a, b) => cmp(amountOf(b), amountOf(a)) || recencyFirst(a, b))
}

export function sortExpenses<T extends GroupableExpense>(
  rows: T[],
  key: ExpenseSortKey,
  dir: ExpenseSortDir,
): T[] {
  const sign = dir === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    if (key === 'amount') {
      return cmp(amountOf(a), amountOf(b)) * sign || recencyFirst(a, b)
    }
    return cmp(a.expense_date, b.expense_date) * sign
      || cmp(amountOf(b), amountOf(a))
      || cmp(b.created_at ?? '', a.created_at ?? '')
  })
}

/** 2027-03-28 → 03/28，需要年份时 → 2027/03/28。 */
function dayLabelOf(date: string, withYear: boolean): string {
  const [y, m, d] = date.split('-')
  return withYear ? `${y}/${m}/${d}` : `${m}/${d}`
}

/**
 * 行内日期：只有不是当前年份的才带上年份。按天分组时日期在组头，用不到它；
 * 按人分组和金额平铺时每行都要自报日期。
 */
export function expenseDayLabel(date: string, currentYear: number): string {
  return dayLabelOf(date, Number(date.slice(0, 4)) !== currentYear)
}

function bucketBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const buckets = new Map<string, T[]>()
  for (const row of rows) {
    const k = keyOf(row)
    const bucket = buckets.get(k)
    if (bucket) bucket.push(row)
    else buckets.set(k, [row])
  }
  return buckets
}

export function groupByDay<T extends GroupableExpense>(
  rows: T[],
  dir: ExpenseSortDir,
  currentYear: number,
): ExpenseGroup<T>[] {
  const buckets = bucketBy(rows, (r) => r.expense_date)
  const keys = Array.from(buckets.keys()).sort()
  if (dir === 'desc') keys.reverse()

  let prevYear = ''
  return keys.map((key, i) => {
    const bucket = buckets.get(key)!
    const total = bucket.reduce((s, r) => s + amountOf(r), 0)
    const year = key.slice(0, 4)
    // 年份重复就省掉；变化时补回来。第一组没有"上一组"可比，改和当前年份
    // 比——否则把筛选拉到去年时，整张列表会一个年份都不出现。
    const withYear = i === 0 ? Number(year) !== currentYear : year !== prevYear
    prevYear = year

    return {
      key,
      label: dayLabelOf(key, withYear),
      rows: byAmountDesc(bucket),
      count: bucket.length,
      total,
      showTotal: bucket.length >= 2,
      overThreshold: total >= DAILY_ALERT_THRESHOLD,
      unassigned: false,
    }
  })
}

export function groupByBuyer<T extends GroupableExpense>(
  rows: T[],
  key: ExpenseSortKey,
  dir: ExpenseSortDir,
  currentYear: number,
): ExpenseGroup<T & { dayLabel: string }>[] {
  const sign = dir === 'asc' ? 1 : -1
  const named = rows.filter((r) => (r.buyer_name ?? '').trim() !== '')
  const orphans = rows.filter((r) => (r.buyer_name ?? '').trim() === '')

  const buckets = bucketBy(named, (r) => r.buyer_name!.trim())
  const totalOf = (bucket: T[]) => bucket.reduce((s, r) => s + amountOf(r), 0)
  const latestOf = (bucket: T[]) => bucket.reduce((d, r) => (r.expense_date > d ? r.expense_date : d), '')

  const order = Array.from(buckets.keys()).sort((a, b) => {
    const ba = buckets.get(a)!, bb = buckets.get(b)!
    const primary = key === 'amount'
      ? cmp(totalOf(ba), totalOf(bb))
      : cmp(latestOf(ba), latestOf(bb))
    // 同分时按姓名定序，免得两次渲染给出不同的顺序。
    return primary * sign || cmp(a, b)
  })

  // 每行自带日期：组头被人名占了，行内得说明这笔发生在哪天。跨年的那些标出
  // 年份——组内日期不连续，没法像按天分组那样靠"和上一组比"来省。
  const withDay = (bucket: T[]) => sortExpenses(bucket, key, dir).map((r) => ({
    ...r,
    dayLabel: expenseDayLabel(r.expense_date, currentYear),
  }))

  const groups: ExpenseGroup<T & { dayLabel: string }>[] = order.map((name) => {
    const bucket = buckets.get(name)!
    return {
      key: `buyer:${name}`,
      label: name,
      rows: withDay(bucket),
      count: bucket.length,
      total: totalOf(bucket),
      showTotal: bucket.length >= 2,
      // 阈值是单日口径。一个人一年花掉的钱超过十万说明不了任何事。
      overThreshold: false,
      unassigned: false,
    }
  })

  // 没有经办人的记录不能凭空消失，单独收在末尾一组。
  if (orphans.length > 0) {
    groups.push({
      key: 'buyer:__unassigned__',
      label: '',
      rows: withDay(orphans),
      count: orphans.length,
      total: totalOf(orphans),
      showTotal: orphans.length >= 2,
      overThreshold: false,
      unassigned: true,
    })
  }

  return groups
}
