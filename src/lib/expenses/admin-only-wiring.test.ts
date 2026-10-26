import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 支出管理仅管理员可访问（src/lib/expenses/access.ts）。route handler、执行器、
// 页面 layout 都依赖 Next / Supabase，node --test 跑不起来，这里用源码断言
// 守住接线：每个入口都要先过 canAccessExpenses()，而且在碰数据之前。
const SRC = new URL('../../', import.meta.url).pathname
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const METHOD_RE = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g

// 按导出的 HTTP 方法切出各自的函数体（到下一个导出为止）。
function handlers(src: string): Map<string, string> {
  const starts = Array.from(src.matchAll(METHOD_RE), (m) => ({ method: m[1], at: m.index! }))
  return new Map(starts.map((s, i) => [s.method, src.slice(s.at, starts[i + 1]?.at ?? src.length)]))
}

function routeFiles(dir: string): string[] {
  return readdirSync(join(SRC, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(SRC, rel)).isDirectory()) return routeFiles(rel)
    return name === 'route.ts' ? [rel] : []
  })
}

// 判定之后才允许出现的「碰数据」调用。
const DATA_TOUCH_RE = /\b(listExpenses|createExpense|updateExpense|deleteExpense|createServerClient)\(/

// 整个目录都管：以后在这两个目录下新增的接口也会被这条规则约束。
const ADMIN_ONLY_DIRS = ['app/api/expenses', 'app/api/expense-saved-views']

test('支出相关 API 的每个 handler 都先过 canAccessExpenses()，不过就回 403', () => {
  let checked = 0
  for (const dir of ADMIN_ONLY_DIRS) {
    const files = routeFiles(dir)
    assert.ok(files.length > 0, `${dir} 下应至少有一个 route.ts`)
    for (const file of files) {
      const hs = handlers(read(file))
      assert.ok(hs.size > 0, `${file} 应导出至少一个 HTTP 方法`)
      hs.forEach((body, method) => {
        const gate = body.indexOf('canAccessExpenses(')
        assert.ok(gate >= 0, `${file} ${method} 必须调用 canAccessExpenses()`)
        const deny = body.slice(gate, gate + 200)
        assert.match(deny, /status: 403/, `${file} ${method} 判定不过要回 403`)
        const touch = body.search(DATA_TOUCH_RE)
        assert.ok(touch === -1 || touch > gate, `${file} ${method} 要先判定再碰数据`)
        checked++
      })
    }
  }
  // 当前盘点：expenses 4（GET/POST + PATCH/DELETE）+ expense-saved-views 4。
  assert.equal(checked, 8)
})

// 从某个函数声明开始，切到下一个顶层函数声明为止。
function fnBody(src: string, signature: string): string {
  const at = src.indexOf(signature)
  assert.ok(at >= 0, `找不到 ${signature}`)
  const next = src.slice(at + signature.length).search(/\n(export )?(async )?function /)
  return next === -1 ? src.slice(at) : src.slice(at, at + signature.length + next)
}

test('命令面板：executeIntent 一进来就挡非管理员，早于 schema 复核与执行', () => {
  const body = fnBody(read('lib/intent/executor.ts'), 'export async function executeIntent(')
  const gate = body.indexOf('canAccessExpenses(')
  assert.ok(gate >= 0, 'executeIntent 必须调用 canAccessExpenses()')
  assert.match(body.slice(gate, gate + 200), /code: 'forbidden'/)
  for (const later of ['ExpenseIntentSchema.safeParse(', 'runQuery(', 'stageWrite(']) {
    const at = body.indexOf(later)
    assert.ok(at > gate, `${later} 必须在 canAccessExpenses() 之后`)
  }
})

test('命令面板：确认执行时支出分支再挡一次，早于任何支出写入', () => {
  const body = fnBody(read('lib/intent/executor.ts'), 'export async function applyPendingAction(')
  const gate = body.indexOf('!canAccessExpenses(actor)')
  assert.ok(gate >= 0, 'applyPendingAction 必须对支出分支调用 canAccessExpenses(actor)')
  for (const write of ['createExpense(', 'updateExpense(', 'deleteExpense(']) {
    const at = body.indexOf(write)
    assert.ok(at > gate, `${write} 必须在 canAccessExpenses(actor) 之后`)
  }
  // 工时任务分支不受影响：它在支出判定之前，判定只落在支出那一支上。
  assert.ok(body.indexOf("row.entity === 'work_task'") < gate)
})

test('/expenses 页面由服务端 layout 拦截非管理员', () => {
  const src = read('app/[locale]/(app)/expenses/layout.tsx')
  assert.doesNotMatch(src, /^'use client'/m, 'layout 必须是服务端组件')
  const gate = src.indexOf('canAccessExpenses(')
  assert.ok(gate >= 0, 'layout 必须调用 canAccessExpenses()')
  assert.ok(src.indexOf('{children}') > gate, '只有判定通过才渲染 children')
})

test('侧边栏：支出管理入口标了 adminOnly，渲染走 visibleNavItems 过滤', () => {
  const src = read('components/layout/Sidebar.tsx')
  assert.match(src, /\{ href: '\/expenses',[^}]*adminOnly: true \}/)
  assert.match(src, /visibleNavItems\(NAV_ITEMS, profile\?\.is_admin === true, profile\?\.access_scope \?\? null\)/)
  assert.doesNotMatch(src, /NAV_ITEMS\.map\(/, '渲染不能绕过过滤直接遍历 NAV_ITEMS')
})
