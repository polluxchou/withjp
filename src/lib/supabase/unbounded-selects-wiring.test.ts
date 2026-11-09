// 防线：全仓的 Supabase 读取查询，要么有行数上限，要么走 fetchAllRows 分页取全，要么在这里登记理由。
//
// PostgREST 单次响应最多 1000 行，超出部分静默截掉、不报错。2026-10-10 竞品截图
// 「上传成功却看不到」就是一句不带上限的 select('*') 在表过千行那天开始丢数据。
// fetchAll.test.ts 只证明分页函数本身对，证明不了各处真的在用它——这里按源码逐条核对。
//
// 这条测试红了怎么办：
//   · 新写了一句整表 / 按条件读取 → 包进 fetchAllRows((from, to) => ... .order('id').range(from, to))，
//     再把它登记进下面的 PAGED；
//   · 只取前 N 条 → 链上直接写 .limit(N)（N ≤ 1000），不用登记；
//   · 这张表按性质就到不了一千行 → 登记进 SMALL_TABLES 或 SCOPED，写清理由。
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'

import { pagedCallProblems, scanSelectReads } from './selectScan.ts'

const SRC = new URL('../../', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

// ── 登记表 ────────────────────────────────────────────────────

// 必须分页取全的读取：文件 → 表 → 处数。数目要与源码完全一致：
// 少了说明有查询被改回不分页（或被换成 .limit 悄悄截断），多了说明新增的没登记。
const PAGED: Record<string, Record<string, number>> = {
  'app/[locale]/(app)/finance-forecast/page.tsx': { expenses: 1 },
  'app/[locale]/(app)/page.tsx': { creators: 1, finance: 1, tasks: 1 },
  'app/[locale]/(app)/team/assignments/page.tsx': { tasks: 1 },
  'app/[locale]/(app)/team/page.tsx': { tasks: 1 },
  'app/api/competitors/quick-history/route.ts': { competitors: 1 },
  'app/api/competitors/quick-shot/route.ts': { competitors: 1 },
  'app/api/conversations/[id]/messages/route.ts': { conversation_messages: 1 },
  'app/api/conversations/route.ts': { conversations: 1 },
  'app/api/creators/route.ts': { creators: 1 },
  'app/api/dashboard/route.ts': { creators: 1, tasks: 1, finance: 1 },
  'app/api/devices/route.ts': { devices: 1 },
  'app/api/finance-forecast/route.ts': { expenses: 1 },
  'app/api/finance/route.ts': { finance: 1 },
  'app/api/tasks/route.ts': { tasks: 1 },
  'lib/competitors/service.ts': {
    competitors: 3, competitor_snapshots: 3, competitor_shots: 4, competitor_descriptions: 1,
    competitor_live_sessions: 3, competitor_companies: 2, competitor_company_accounts: 2,
    competitor_live_summaries: 1,
  },
  'lib/expenses/service.ts': { expenses: 2 },
  'lib/intent/executor.ts': { expenses: 1 },
  'lib/items/service.ts': { items: 1 },
  'lib/org/service.ts': { creators: 1, business_tasks: 1, business_task_positions: 1, task_items: 1 },
  'lib/venue/service.ts': { venue_items: 2 },
  'lib/work-tasks/service.ts': { task_items: 1 },
}

// 名册 / 配置类的表：行数由人手维护，量级是几十，不随日常业务增长。整表读取不设上限。
// 哪张表开始由程序批量写入了，就把它从这里拿掉、改走 fetchAllRows。
const SMALL_TABLES: Record<string, string> = {
  agents: 'Agent 名册，固定几个角色',
  config: '键值配置',
  users: '后台成员名册',
  broadcast_accounts: '直播账号名册，人手登记',
  knowledge: '知识库条目，人手维护',
  milestones: '里程碑，人手维护',
  user_salary: '薪资记录，每人每次调薪一行',
  site_news: '官网新闻，人手发布',
  site_members: '官网成员页，人手维护',
  businesses: '业务线，个位数',
  positions: '岗位，人手维护',
  position_members: '岗位成员，上限是 岗位数 × 人数',
  venues: '场地，个位数',
  venue_floors: '场地楼层',
  venue_editors: '场地协作者，上限是 场地数 × 人数',
  finance_forecast_views: '财务预测视图，每人几个',
}

// 结果集被调用方式限定住的读取：文件 → 表 → [处数, 理由]。处数要与源码完全一致。
const SCOPED: Record<string, Record<string, [count: number, why: string]>> = {
  'app/api/competitors/quick-shot/route.ts': {
    competitor_shots: [1, '两个 in 精确匹配，上限是 本次请求的竞品数 × 时刻数'],
  },
  'app/api/creators/[id]/route.ts': {
    tasks: [1, '单个主播名下的任务'],
    finance: [1, '单个主播名下的收支记录'],
    lifecycle_transitions: [1, '单个主播的状态流转历史'],
  },
  'app/api/expense-saved-views/route.ts': {
    expense_saved_views: [1, '当前用户自己保存的视图'],
  },
  'app/api/work-tasks/route.ts': {
    work_tasks: [1, 'build() 供两条分支共用：带 limit 的只取前 N 条，不带的由 fetchAllRows 调它分页（见下方专项断言）'],
  },
  'lib/competitors/service.ts': {
    competitor_viewer_readings: [1, '单张截图上的同期在播读数，上限是同时在播的账号数'],
  },
  'lib/discussions/service.ts': {
    discussion_threads: [2, '限定在单个业务对象 / 一批对象键上的讨论串'],
    discussion_messages: [1, '单个讨论串里的消息'],
  },
  'lib/finance-forecast/lifecycle.ts': {
    finance_forecast_lifecycle_templates: [1, '单个用户的生命周期模板，行数由 阶段 × 月份 的固定网格决定'],
  },
  'lib/finance-forecast/service.ts': {
    finance_forecast_months: [2, '单个视图、指定年份，每年 12 行'],
    finance_forecast_accounts: [2, '单个视图、指定年份的预测账号'],
  },
  'lib/intent/executor.ts': {
    expenses: [1, '候选查询，分步拼接，后面接 .limit(11)'],
  },
  'lib/items/service.ts': {
    item_status_logs: [1, '单件物品的状态变更历史'],
  },
}

// ── 扫描 ──────────────────────────────────────────────────────

type Tally = Record<string, Record<string, number>>
const bump = (t: Tally, file: string, table: string) => {
  t[file] ??= {}
  t[file][table] = (t[file][table] ?? 0) + 1
}

const files = sourceFiles(SRC)
const sources = new Map(files.map((f) => [relative(SRC, f), readFileSync(f, 'utf8')]))
const paged: Tally = {}
const open: Tally = {}
sources.forEach((src, file) => {
  for (const r of scanSelectReads(src)) {
    if (r.guard === 'paged') bump(paged, file, r.table)
    else if (r.guard === null) bump(open, file, r.table)
  }
})

test('扫描确实扫到了东西（路径没算错）', () => {
  assert.ok(sources.size > 200, `只扫到 ${sources.size} 个源文件`)
  assert.ok(Object.keys(paged).length > 0)
})

test('每个内联查询的 fetchAllRows 都以 .range(from, to) 切页，且之前有 .order(\'id\' 兜底', () => {
  const problems: string[] = []
  sources.forEach((src, file) => {
    for (const p of pagedCallProblems(src)) problems.push(`${file}:${p.line} ${p.problem}`)
  })
  assert.deepEqual(problems, [])
})

test('走 fetchAllRows 的读取与 PAGED 登记完全一致', () => {
  assert.deepEqual(paged, PAGED,
    '分页读取与登记不一致：少了=有查询被改回不分页，超过 1000 行会被静默截断；多了=新增的分页读取没登记进 PAGED')
})

test('没有上限的读取，都登记了理由（SMALL_TABLES 或 SCOPED）', () => {
  const unexplained: string[] = []
  for (const [file, tables] of Object.entries(open)) {
    for (const [table, count] of Object.entries(tables)) {
      if (table in SMALL_TABLES) continue
      const allowed = SCOPED[file]?.[table]?.[0] ?? 0
      if (count !== allowed) {
        unexplained.push(`${file} 读 ${table}：${count} 处没有行数上限，登记了 ${allowed} 处`)
      }
    }
  }
  assert.deepEqual(unexplained, [],
    '超过 1000 行会被静默截断：包进 fetchAllRows（并登记 PAGED），或写 .limit(N≤1000)，或登记理由')
})

test('登记表里没有过期条目', () => {
  const openTables = new Set(Object.values(open).flatMap((t) => Object.keys(t)))
  for (const table of Object.keys(SMALL_TABLES)) {
    assert.ok(openTables.has(table), `SMALL_TABLES 里的 ${table} 已经没有不设上限的读取了，删掉这条`)
  }
  for (const [file, tables] of Object.entries(SCOPED)) {
    for (const [table, [, why]] of Object.entries(tables)) {
      assert.ok(open[file]?.[table], `SCOPED 里的 ${file} → ${table} 已经没有不设上限的读取了，删掉这条`)
      assert.ok(why.trim().length > 0)
      assert.ok(!(table in SMALL_TABLES), `${table} 同时登记在 SMALL_TABLES 和 SCOPED`)
    }
  }
})

test('同一张表不能既登记为必须分页又登记为小表', () => {
  const pagedTables = new Set(Object.values(PAGED).flatMap((t) => Object.keys(t)))
  for (const table of Object.keys(SMALL_TABLES)) {
    assert.ok(!pagedTables.has(table), `${table} 在 PAGED 里要求分页，又在 SMALL_TABLES 里豁免`)
  }
})

// /api/work-tasks 的 build() 写在 fetchAllRows 回调外面，上面的扫描看不进去，单独核对。
test('/api/work-tasks：不带 limit 时由 fetchAllRows 调 build() 分页，build() 以 id 兜底排序', () => {
  const src = sources.get('app/api/work-tasks/route.ts')
  assert.ok(src)
  assert.match(src, /fetchAllRows\(\(from, to\) => build\(\)\.range\(from, to\)\)/)
  const build = src.slice(src.indexOf('const build = () => {'), src.indexOf('fetchAllRows('))
  assert.match(build, /\.order\('id', \{ ascending: true \}\)\s*\n\s*\}/, 'build() 的最后一个排序键必须是 id')
})

// 支出页的月份选择器曾经为了数月份把整张支出表拉到浏览器。
test('支出页不再用不带参数的 /api/expenses 取月份', () => {
  const src = sources.get('app/[locale]/(app)/expenses/page.tsx')
  assert.ok(src)
  assert.doesNotMatch(src, /fetch\('\/api\/expenses'\)/)
  assert.match(src, /fetch\('\/api\/expenses\/months'\)/)
})
