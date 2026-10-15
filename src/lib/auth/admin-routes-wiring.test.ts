import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 薪资、全局规则配置、Agent 定义与执行这几组接口的权限表。判定本身的行为在
// admin-gate.test.ts 里测；这里钉住 route.ts 确实接上了它，且顺序是
// 「鉴权（未登录 401 早退）→ 管理员判定（403 早退）→ 才碰数据库」。
// route.ts 引用 next/server 与 @/ 别名，node --test 加载不了，只能读源码。
const API = new URL('../../app/api/', import.meta.url).pathname
const read = (rel: string) => readFileSync(join(API, rel), 'utf8')

const METHOD_RE = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g

// 按导出的 HTTP 方法切出各自的函数体（到下一个导出为止）。
function handlers(src: string): Map<string, string> {
  const starts = Array.from(src.matchAll(METHOD_RE), (m) => ({ method: m[1], at: m.index! }))
  return new Map(starts.map((s, i) => [s.method, src.slice(s.at, starts[i + 1]?.at ?? src.length)]))
}

// 函数体的头两条语句必须是：鉴权 + 401 早退，紧接管理员判定 + 403 早退。
// authGuard 与 authGuardStrict 都认（PR 343 把薪资接口换成 strict 版本）。
const ADMIN_PREAMBLE_RE = new RegExp(
  String.raw`^export async function \w+\([^)]*\) \{\n` +
    String.raw`\s*const user = await authGuard(?:Strict)?\(\);?\n` +
    String.raw`\s*if \(user instanceof NextResponse\) return user;?\n` +
    String.raw`\s*const denied = await forbidUnlessAdmin\(user\.id\);?\n` +
    String.raw`\s*if \(denied\) return denied;?\n`,
)
const LOGIN_PREAMBLE_RE =
  /^export async function \w+\([^)]*\) \{\n\s*const user = await authGuard(?:Strict)?\(\);?\n\s*if \(user instanceof NextResponse\) return user;?\n/

// self = 管理员看全部，其他人只读自己的（目前只有薪资 GET）。
// execute-admin = 登录即可，但 body.action === 'execute' 那一支仅管理员
// （PATCH /api/tasks/:id：手动改字段与触发执行共用一个方法）。
type Access = 'admin' | 'self' | 'login' | 'execute-admin'

// 这些文件里每个导出的方法都必须出现在表里——以后新增方法要先在这里定口径。
const POLICY: Record<string, Record<string, Access>> = {
  'user-salary/route.ts': { GET: 'self', POST: 'admin' },
  'user-salary/[id]/route.ts': { PATCH: 'admin', DELETE: 'admin' },
  'config/route.ts': { GET: 'login', PATCH: 'admin' },
  'agents/route.ts': { GET: 'login', POST: 'admin' },
  'agents/[id]/route.ts': { PATCH: 'admin' },
  'agents/[id]/execute/route.ts': { POST: 'admin' },
  'agents/test-connection/route.ts': { POST: 'admin' },
  'tasks/[id]/route.ts': { GET: 'login', PATCH: 'execute-admin', DELETE: 'login' },
}

test('每个导出的方法都在权限表里，表里的方法也都还在', () => {
  for (const [file, policy] of Object.entries(POLICY)) {
    assert.deepEqual(Array.from(handlers(read(file)).keys()).sort(), Object.keys(policy).sort(), file)
  }
})

test('管理员专属的方法：先鉴权，紧接 forbidUnlessAdmin，之后才读库', () => {
  let checked = 0
  for (const [file, policy] of Object.entries(POLICY)) {
    const hs = handlers(read(file))
    for (const [method, access] of Object.entries(policy)) {
      if (access !== 'admin') continue
      assert.match(hs.get(method) ?? '', ADMIN_PREAMBLE_RE, `${file} ${method} 必须以鉴权 + 管理员判定开头`)
      checked++
    }
  }
  // 当前盘点：薪资写 3 + config PATCH 1 + agents 写 2 + 执行 1 + 测试连接 1。
  // 少了说明表或切分出了问题。
  assert.equal(checked, 8)
})

test('执行 Agent 的分支：鉴权之后、调 executeAgent 之前先过 forbidUnlessAdmin', () => {
  let checked = 0
  for (const [file, policy] of Object.entries(POLICY)) {
    const hs = handlers(read(file))
    for (const [method, access] of Object.entries(policy)) {
      if (access !== 'execute-admin') continue
      const body = hs.get(method) ?? ''
      assert.match(body, LOGIN_PREAMBLE_RE, `${file} ${method} 必须以鉴权开头`)
      const branch = body.search(
        /\n\s*if \(body\.action === 'execute'\) \{\n\s*const denied = await forbidUnlessAdmin\(user\.id\);?\n\s*if \(denied\) return denied;?\n/,
      )
      assert.ok(branch > 0, `${file} ${method} 的 execute 分支必须先做管理员判定`)
      assert.equal(body.match(/executeAgent\(/g)?.length, 1, `${file} ${method} 只能有一处 executeAgent`)
      assert.ok(body.indexOf('executeAgent(') > branch, `${file} ${method} 的 executeAgent 必须在管理员判定之后`)
      checked++
    }
  }
  assert.equal(checked, 1)
})

// 以后再加调用 executeAgent 的接口，必须先进权限表，并且整个方法或执行分支要求管理员。
test('所有调用 executeAgent 的接口都在权限表里且要求管理员', () => {
  const callers = (readdirSync(API, { recursive: true }) as string[])
    .filter((f) => f.endsWith('route.ts') && /\bexecuteAgent\(/.test(read(f)))
    .sort()
  assert.deepEqual(callers, ['agents/[id]/execute/route.ts', 'tasks/[id]/route.ts'])
  for (const file of callers) {
    for (const [method, body] of Array.from(handlers(read(file)))) {
      if (!/\bexecuteAgent\(/.test(body)) continue
      assert.ok(['admin', 'execute-admin'].includes(POLICY[file]?.[method]), `${file} ${method} 调用了 executeAgent 却没要求管理员`)
    }
  }
})

test('只需登录的方法：有鉴权，不做管理员判定', () => {
  for (const [file, policy] of Object.entries(POLICY)) {
    const hs = handlers(read(file))
    for (const [method, access] of Object.entries(policy)) {
      if (access !== 'login') continue
      const body = hs.get(method) ?? ''
      assert.match(body, LOGIN_PREAMBLE_RE, `${file} ${method} 必须以鉴权开头`)
      assert.doesNotMatch(body, /forbidUnlessAdmin/, `${file} ${method} 不应做管理员判定`)
    }
  }
})

test('薪资 GET：先鉴权，再按 salaryReadScope 定范围，只按它给的 userId 查', () => {
  let checked = 0
  for (const [file, policy] of Object.entries(POLICY)) {
    const hs = handlers(read(file))
    for (const [method, access] of Object.entries(policy)) {
      if (access !== 'self') continue
      const body = hs.get(method) ?? ''
      assert.match(
        body,
        new RegExp(
          LOGIN_PREAMBLE_RE.source +
            String.raw`(?:\s*//[^\n]*\n)?` +
            String.raw`\s*const scope = salaryReadScope\(await getActorProfile\(user\.id\), user\.id, req\.nextUrl\.searchParams\.get\('user_id'\)\)\n` +
            String.raw`\s*if \(!scope\.ok\) return NextResponse\.json\(FORBIDDEN_BODY, \{ status: 403 \}\)\n`,
        ),
        `${file} ${method} 必须在鉴权之后、读库之前定好读取范围`,
      )
      assert.match(body, /if \(scope\.userId\)\s+query = query\.eq\('user_id', scope\.userId\)/)
      // 请求里的 user_id 只许交给 salaryReadScope，不许绕过它直接拿去查。
      assert.equal(body.match(/searchParams\.get\('user_id'\)/g)?.length, 1, `${file} ${method} 只能读一次 user_id`)
      assert.doesNotMatch(body, /forbidUnlessAdmin/, `${file} ${method} 不是管理员专属`)
      checked++
    }
  }
  assert.equal(checked, 1)
})

test('require-admin.ts 绑定的是真实的 getActorProfile 与 NextResponse.json', () => {
  const src = readFileSync(new URL('./require-admin.ts', import.meta.url), 'utf8')
  assert.match(src, /^import \{ getActorProfile \} from '@\/lib\/auth\/actor'$/m)
  assert.match(
    src,
    /export const forbidUnlessAdmin = createAdminGate\(\{\n\s*getActorProfile,\n\s*respond: \(body, init\) => NextResponse\.json\(body, init\),\n\}\)/,
  )
})
