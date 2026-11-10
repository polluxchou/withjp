import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// instrumentation.ts 与各错误边界引用 next/* 与 @/ 别名，node --test 加载不了，
// 只能读源码。记录内容与脱敏在 src/lib/observability/*.test.ts 里测真行为；
// 这里钉住接线：错误只经 reportError 一个出口出去。
const SRC = fileURLToPath(new URL('./', import.meta.url))
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const code = (src: string) => src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')

test('onRequestError：只把 error / request / context 交给记录构造，再走 reportError', () => {
  const src = code(read('instrumentation.ts'))
  assert.match(
    src,
    /export const onRequestError: Instrumentation\.onRequestError = \(error, request, context\) => \{\n\s*reportError\(buildRequestErrorRecord\(\{ error, request, context \}\)\)\n\}/,
  )
  assert.doesNotMatch(src, /headers|cookie|console\./)
})

function walk(dir: string): string[] {
  return readdirSync(join(SRC, dir)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(SRC, rel)).isDirectory()) return walk(rel)
    return /\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) ? [rel] : []
  })
}

test('每个 error 边界都经 useReportBoundaryError 上报，不自己打日志', () => {
  const boundaries = walk('app').filter((f) => /(?:^|\/)(?:error|global-error)\.tsx$/.test(f)).sort()
  assert.deepEqual(boundaries, [
    'app/[locale]/(app)/error.tsx',
    'app/[locale]/error.tsx',
    'app/[locale]/site/error.tsx',
    'app/global-error.tsx',
  ])
  for (const file of boundaries) {
    const src = code(read(file))
    assert.match(src, /^'use client'/, `${file} 必须是 client 组件`)
    const uses = /useReportBoundaryError\('(?:admin|site|global)', error\)/.test(src) || /<AdminRouteError /.test(src)
    assert.ok(uses, `${file} 应经 useReportBoundaryError 上报`)
    assert.doesNotMatch(src, /console\./, `${file} 不直接打日志`)
    // 生产环境 error.message 是 Next 的通用占位，开发环境是原始报错——两种都不给用户看。
    assert.doesNotMatch(src, /error\.(?:message|stack)/, `${file} 不向用户展示原始报错`)
  }
  assert.match(code(read('components/layout/AdminRouteError.tsx')), /useReportBoundaryError\('admin', error\)/)
})

test('reportError 是唯一出口：别处不直接构造上报', () => {
  const callers = walk('').filter((f) => /\breportError\(/.test(code(read(f)))).sort()
  assert.deepEqual(callers, [
    'instrumentation.ts',
    'lib/observability/report.ts',
    'lib/observability/useReportBoundaryError.ts',
  ])
})

test('/api/health：不鉴权、不缓存，响应体只来自 runHealthChecks', () => {
  const src = code(read('app/api/health/route.ts'))
  assert.doesNotMatch(src, /authGuard|cookies\(|headers\(/)
  assert.match(src, /export const dynamic = 'force-dynamic'/)
  assert.match(src, /'Cache-Control': 'no-store'/)
  assert.match(src, /return NextResponse\.json\(report, \{/)
  assert.doesNotMatch(src, /error\.message|console\./, '报错原文不出接口、也不进日志')
  assert.deepEqual(Array.from(src.matchAll(/export async function (\w+)\(/g), (m) => m[1]), ['GET'])
})
