import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 薪资、规则配置、Agent 模型的写接口只给管理员（见 admin-routes-wiring.test.ts）。
// 前端没有 DOM 测试环境，这里钉住页面确实按 isAdmin 收起写控件、写失败走
// writeFailureMessage（403 给「仅管理员可以执行此操作」），别让非管理员点了
// 按钮静默失败。isAdmin / writeFailureMessage 的行为在 admin-gate.test.ts 里测。
const SRC = new URL('../../', import.meta.url).pathname
const read = (rel: string) => readFileSync(SRC + rel, 'utf8')

const FORBIDDEN_MSG_RE = /writeFailureMessage\(res\??\.status[^)]*?\{\n\s*forbidden: tCommon\('adminOnlyAction'\)/

test('工时页：薪资管理入口与抽屉只给管理员', () => {
  const s = read('app/[locale]/(app)/tasks/page.tsx')
  assert.match(s, /const canManageSalary = isAdmin\(useCurrentUser\(\)\)/)
  assert.match(s, /\{mainTab === 'workload' && canManageSalary && \(\n\s*<Button[^>]*onClick=\{\(\) => setShowSalary\(true\)\}/)
  assert.match(s, /\{showSalary && canManageSalary && \(/)
})

test('工时页：成本可见性按管理员身份算出，三个视图都拿到', () => {
  const s = read('app/[locale]/(app)/tasks/page.tsx')
  assert.match(s, /const costs = costVisibility\(salaryMap, canManageSalary\)/)
  for (const view of ['WorkloadDayView', 'WorkloadWeekView', 'WorkloadMonthView']) {
    const at = s.indexOf(`<${view}\n`)
    assert.ok(at > 0, `应渲染 ${view}`)
    assert.match(s.slice(at, s.indexOf('/>', at)), /costs=\{costs\}/, `${view} 要传 costs`)
  }
})

// 非管理员只拿到自己的薪资：每个显示金额的地方都必须先过 costs.totals / costs.user()，
// 否则别人的成本会以 ¥0 显示出来。
test('工时视图：每处金额都挂在成本可见性判断后面', () => {
  for (const view of ['WorkloadDayView', 'WorkloadWeekView', 'WorkloadMonthView']) {
    const s = read(`components/work-tasks/${view}.tsx`)
    assert.match(s, /\bcosts: +CostVisibility\b/, `${view} 的 Props 要有 costs`)
    const uses = Array.from(s.matchAll(/fmtRmb\(/g), (m) => m.index!).filter((i) => !s.slice(i - 9, i).includes('function'))
    assert.ok(uses.length >= 2, `${view} 应至少有两处金额`)
    for (const i of uses) {
      assert.match(s.slice(Math.max(0, i - 240), i), /costs\.(?:totals|user\()/, `${view} 第 ${s.slice(0, i).split('\n').length} 行的金额没过可见性判断`)
    }
  }
})

test('薪资管理：保存与删除失败都给出提示，403 用管理员文案', () => {
  const s = read('components/work-tasks/SalaryManager.tsx')
  const save = s.slice(s.indexOf('async function handleSave('), s.indexOf('async function handleDelete('))
  const del = s.slice(s.indexOf('async function handleDelete('), s.indexOf('return (\n'))
  assert.match(save, /if \(!res\.ok \|\| json\?\.error\) \{/)
  assert.match(save, FORBIDDEN_MSG_RE)
  assert.match(del, /if \(!res\?\.ok\) \{/)
  assert.match(del, FORBIDDEN_MSG_RE)
  assert.match(s, /\{delError && \(/, '删除失败要在确认弹窗里显示出来')
})

test('规则配置页：非管理员只读、没有保存按钮，保存失败给提示', () => {
  const s = read('app/[locale]/(app)/config/page.tsx')
  assert.match(s, /const canWrite = isAdmin\(me\)/)
  assert.match(s, /actions=\{canWrite && \(/)
  assert.match(s, /readOnly=\{!canWrite\}/)
  assert.match(s, /if \(!res\.ok\) \{/)
  assert.match(s, FORBIDDEN_MSG_RE)
  assert.match(s, /\{errors\[config\.key\] && \(/)
})

test('Agent 模型配置：非管理员在渲染下拉与保存之前就返回只读视图', () => {
  const s = read('components/agents/AgentModelEditor.tsx')
  const gate = s.indexOf('if (!isAdmin(me)) {')
  assert.ok(gate > 0, '要有 isAdmin(me) 的只读分支')
  assert.ok(gate < s.indexOf('<Select'), '只读分支必须在下拉之前 return')
  assert.ok(gate < s.indexOf('onClick={handleSave}'), '只读分支必须在保存按钮之前 return')
  assert.match(s, FORBIDDEN_MSG_RE)
})

// 执行 Agent 的两个接口都只给管理员（见 admin-routes-wiring.test.ts）：三个页面的
// 「执行 / 运行」按钮按 isAdmin 收起，失败（含 403）要把提示挂到那条 task 上。
const EXECUTE_PAGES = [
  { file: 'app/[locale]/(app)/timeline/[id]/page.tsx', handler: 'const handleExecuteTask = async (', end: 'if (loading) return' },
  { file: 'app/[locale]/(app)/tasks/page.tsx', handler: 'async function executeTask(', end: 'const counts = {' },
  { file: 'app/[locale]/(app)/creators/[id]/page.tsx', handler: 'async function executeTask(', end: 'async function submitFinance(' },
]

test('执行 Agent：三个页面的按钮只给管理员，失败给提示', () => {
  for (const { file, handler, end } of EXECUTE_PAGES) {
    const s = read(file)
    assert.match(s, /const canExecute = isAdmin\(useCurrentUser\(\)\)/, file)
    assert.match(s, /\{canExecute && task\.status === 'pending' && /, `${file} 的按钮要挂在 canExecute 后面`)
    assert.equal(s.match(/\{(?:canExecute && )?task\.status === 'pending' && /g)?.length, 1, `${file} 只能有一处待执行按钮`)
    const at = s.indexOf(handler)
    assert.ok(at > 0, `${file} 应有执行函数`)
    const fn = s.slice(at, s.indexOf(end, at))
    assert.match(fn, /if \(!res\??\.ok\) \{/, `${file} 要检查响应`)
    assert.match(fn, FORBIDDEN_MSG_RE, `${file} 403 要用管理员文案`)
    assert.match(fn, /fallback: tCommon\('runFailed'\)/, file)
    assert.match(s, /\{execError\?\.taskId === task\.id && \(/, `${file} 要把错误显示在那条 task 上`)
  }
})

test('Agent 模型配置：测试连接失败也走 writeFailureMessage', () => {
  const s = read('components/agents/AgentModelEditor.tsx')
  const fn = s.slice(s.indexOf('const handleTest = async ('), s.indexOf('const modelOptions ='))
  assert.match(fn, /fetch\('\/api\/agents\/test-connection'/)
  assert.match(fn, FORBIDDEN_MSG_RE)
})
