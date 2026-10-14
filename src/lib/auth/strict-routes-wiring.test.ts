import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// 敏感操作必须用 authGuardStrict()（每次向 Auth 服务器现查，登出/删号下一次
// 请求就挡下）；其余接口用 authGuard()（本地验签，吊销要等 access token 过期）。
// 范围由 pollux 2026-10-14 选定：薪资、财务与支出、人员与权限、对外官网写入。
const API = new URL('../../app/api/', import.meta.url).pathname
const read = (rel: string) => readFileSync(join(API, rel), 'utf8')

const METHOD_RE = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g

// 按导出的 HTTP 方法切出各自的函数体（到下一个导出为止）。
function handlers(src: string): Map<string, string> {
  const starts = Array.from(src.matchAll(METHOD_RE), (m) => ({ method: m[1], at: m.index! }))
  return new Map(starts.map((s, i) => [s.method, src.slice(s.at, starts[i + 1]?.at ?? src.length)]))
}

function routeFiles(dir: string): string[] {
  return readdirSync(join(API, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(API, rel)).isDirectory()) return routeFiles(rel)
    return name === 'route.ts' ? [rel] : []
  })
}

const isStrict = (body: string) => /\bauthGuardStrict\(\)/.test(body) && !/\bauthGuard\(\)/.test(body)
const isFast = (body: string) => /\bauthGuard\(\)/.test(body) && !/\bauthGuardStrict\(\)/.test(body)

// 整个目录都敏感：以后在这些目录下新增的接口也会被这条规则管到。
const STRICT_DIRS = ['user-salary', 'finance', 'finance-forecast', 'expenses', 'users', 'admin']

test('every handler under the sensitive API directories uses authGuardStrict()', () => {
  let checked = 0
  for (const dir of STRICT_DIRS) {
    const files = routeFiles(dir)
    assert.ok(files.length > 0, `${dir} 下应至少有一个 route.ts`)
    for (const file of files) {
      const hs = handlers(read(file))
      assert.ok(hs.size > 0, `${file} 应导出至少一个 HTTP 方法`)
      hs.forEach((body, method) => {
        assert.ok(isStrict(body), `${file} ${method} 必须用 authGuardStrict()`)
        checked++
      })
    }
  }
  // 当前盘点：薪资 4 + 财务与支出 14 + users 1 + admin 1。少了说明切分或目录出了问题。
  assert.equal(checked, 20)
})

test('profile: changing your own role is strict, reading the profile stays fast', () => {
  const hs = handlers(read('profile/route.ts'))
  assert.ok(isStrict(hs.get('PATCH') ?? ''), 'PATCH /api/profile 必须用 authGuardStrict()')
  assert.ok(isFast(hs.get('GET') ?? ''), 'GET /api/profile 保持 authGuard()')
})

test('public-site writes are strict, public-site reads stay fast', () => {
  const cases: [string, string, boolean][] = [
    ['site/news/route.ts', 'GET', false],
    ['site/news/route.ts', 'POST', true],
    ['site/news/[id]/route.ts', 'PATCH', true],
    ['site/news/[id]/route.ts', 'DELETE', true],
    ['site/members/route.ts', 'GET', false],
    ['site/members/route.ts', 'POST', true],
    ['site/members/[no]/route.ts', 'PATCH', true],
    ['site/members/[no]/route.ts', 'DELETE', true],
  ]
  for (const [file, method, strict] of cases) {
    const body = handlers(read(file)).get(method)
    assert.ok(body, `${file} 应导出 ${method}`)
    const usesStrict = /RouteDeps\(\{ strict: true \}\)/.test(body)
    assert.equal(usesStrict, strict, `${file} ${method} ${strict ? '必须' : '不应'}带 { strict: true }`)
  }
  const upload = read('site/upload/route.ts')
  assert.match(upload, /authGuard: boundSiteContentAuthGuardStrict\b/)
})

test('site deps adapter binds authGuardStrict only when asked to', () => {
  const src = read('site/_shared/deps.ts')
  const strictAt = src.indexOf('export async function boundSiteContentAuthGuardStrict(')
  assert.ok(strictAt >= 0, 'deps.ts 应导出 boundSiteContentAuthGuardStrict')
  assert.match(src.slice(strictAt, src.indexOf('\n}\n', strictAt)), /await authGuardStrict\(\)/)
  assert.match(src, /strict \? boundSiteContentAuthGuardStrict : boundSiteContentAuthGuard/)
})
