import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 受限帐号（只开竞品，见 access-scope.ts）的接口接线。行为在 access-scope.test.ts、
// page-session.test.ts 里测；这里钉住：哪些接口放它进来、改/删前有没有查 owner。
// 路由引用 next/* 与 @/ 别名，node --test 加载不了，只能读源码。
const API = new URL('../../app/api/', import.meta.url).pathname
const read = (rel: string) => readFileSync(join(API, rel), 'utf8')

const METHOD_RE = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g
function handlers(src: string): Map<string, string> {
  const starts = Array.from(src.matchAll(METHOD_RE), (m) => ({ method: m[1], at: m.index! }))
  return new Map(starts.map((s, i) => [s.method, src.slice(s.at, starts[i + 1]?.at ?? src.length)]))
}
function routeFiles(dir = ''): string[] {
  return readdirSync(join(API, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(API, rel)).isDirectory()) return routeFiles(rel)
    return name === 'route.ts' ? [rel] : []
  })
}

const OPT_IN = /authGuard(?:Strict)?\(\{ allowScope: COMPETITORS_SCOPE \}\)/

// 放行受限帐号的接口只能是这些：竞品监测本身 + 自己的资料与通知。
// 新增一项先想清楚它会不会露出别的模块的数据。quick-shot 走 Bearer 令牌、只碰本人截图，不经 authGuard。
const ALLOWED = new Set([
  'competitors/route.ts',
  'competitors/[id]/route.ts',
  'competitors/[id]/descriptions/route.ts',
  'competitors/[id]/live-sessions/route.ts',
  'competitors/[id]/shots/route.ts',
  'competitors/upload/route.ts',
  'competitors/shots/route.ts',
  'competitors/shots/[shotId]/route.ts',
  'competitors/shots/[shotId]/readings/route.ts',
  'competitors/descriptions/[descriptionId]/route.ts',
  'profile/route.ts',
  'notifications/route.ts',
  'notifications/read-all/route.ts',
  'notifications/[id]/read/route.ts',
])

test('只有登记过的接口放行受限帐号，其余都走默认 403', () => {
  const optedIn = routeFiles().filter((f) => OPT_IN.test(read(f))).sort()
  assert.deepEqual(optedIn, [...ALLOWED].sort())
})

test('登记的接口每个方法都放行（否则受限帐号用到一半 403）', () => {
  for (const file of ALLOWED) {
    handlers(read(file)).forEach((body, method) => {
      assert.match(body, OPT_IN, `${file} ${method}`)
    })
  }
})

test('/api/intent 不放行：指令面板能跨模块写数据', () => {
  assert.doesNotMatch(read('intent/route.ts'), /allowScope/)
})

// 改/删已有记录：鉴权之后、读 body 与写库之前先查 owner。
const OWNED: [file: string, method: string, table: string, op: string][] = [
  ['competitors/[id]/route.ts', 'PATCH', 'competitors', 'update'],
  ['competitors/[id]/route.ts', 'DELETE', 'competitors', 'delete'],
  ['competitors/shots/[shotId]/route.ts', 'PATCH', 'competitor_shots', 'update'],
  ['competitors/shots/[shotId]/route.ts', 'DELETE', 'competitor_shots', 'delete'],
  ['competitors/descriptions/[descriptionId]/route.ts', 'PATCH', 'competitor_descriptions', 'update'],
  ['competitors/descriptions/[descriptionId]/route.ts', 'DELETE', 'competitor_descriptions', 'delete'],
]

test('改/删竞品记录前先过 checkScopedWrite，且查不过就早退', () => {
  for (const [file, method, table, op] of OWNED) {
    const body = handlers(read(file)).get(method) ?? ''
    const check = body.indexOf(`checkScopedWrite(user, '${table}', `)
    assert.ok(check > 0, `${file} ${method} 应调 checkScopedWrite(${table})`)
    assert.match(body, new RegExp(`checkScopedWrite\\(user, '${table}', [^)]+, '${op}'\\)\\n\\s*if \\(denied\\.error\\) \\{\\n\\s*return NextResponse\\.json`), `${file} ${method}`)
    const write = body.search(/await (update|delete)\w+\(/)
    assert.ok(write > check, `${file} ${method} 的检查要在写库之前`)
    const json = body.indexOf('req.json()')
    assert.ok(json < 0 || json > check, `${file} ${method} 的检查要在读 body 之前`)
  }
})

test('新增类接口把当前用户记成 created_by，开播记录导入带上 actor', () => {
  assert.match(read('competitors/[id]/shots/route.ts'), /addShot\(params\.id, body, user\.id\)/)
  assert.match(read('competitors/[id]/descriptions/route.ts'), /addDescription\(params\.id, body, user\.id\)/)
  assert.match(read('competitors/[id]/live-sessions/route.ts'), /upsertLiveSessions\(params\.id, body\?\.sessions, user\)/)
  assert.match(read('competitors/route.ts'), /addCompetitor\(user\.id, body\)/)
})

// ---- 守卫与页面 ----
const SRC = new URL('../../', import.meta.url).pathname
const readSrc = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

test('authGuard / authGuardStrict 的返回都经过范围判定（默认拒绝受限帐号）', () => {
  const src = readSrc('lib/auth/guard.ts')
  assert.match(src, /return scoped\(user, opts\)/)
  assert.match(src, /return scoped\(error \? null : authedUserFromUser\(user\), opts\)/)
  assert.doesNotMatch(src, /\?\? unauthorized\(\)/, '不能再有绕过范围判定的返回')
})

test('middleware：登录检查之后把受限帐号送回竞品首页', () => {
  const src = readSrc('lib/supabase/middleware.ts')
  const login = src.indexOf('if (!data?.claims?.sub)')
  const scope = src.indexOf('pageAllowedForScope(accessScopeOf(data.claims.app_metadata), pathnameWithoutLocale)')
  assert.ok(login > 0 && scope > login, 'middleware 应在登录检查后判范围')
  assert.match(src.slice(scope), /^[^\n]*\) \{\n[\s\S]*?url\.pathname = scopedHomePath\([\s\S]*?return redirectWithCookies\(url, supabaseResponse\)/)
})

test('后台页面里只有共享 layout 与竞品页放行受限帐号', () => {
  const APP = 'app/[locale]/(app)/'
  const allowed = ['layout.tsx', 'competitors/page.tsx', 'competitors/live/page.tsx', 'competitors/companies/page.tsx']
  const walk = (dir: string): string[] => readdirSync(join(SRC, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(SRC, rel)).isDirectory()) return walk(rel)
    return /\.tsx?$/.test(name) ? [rel] : []
  })
  const optedIn = walk(APP).filter((f) => /allowScope: COMPETITORS_SCOPE/.test(readSrc(f)))
    .map((f) => f.slice(APP.length)).sort()
  assert.deepEqual(optedIn, allowed.sort())
})

test('页面会话取用户时不能先被范围挡掉（否则受限帐号在竞品页也被当成没登录）', () => {
  const src = readSrc('lib/auth/require-page-user.ts')
  assert.match(src, /const user = await authGuard\(\{ allowScope: COMPETITORS_SCOPE \}\)/)
  assert.doesNotMatch(src, /authGuard\(\)/)
})
