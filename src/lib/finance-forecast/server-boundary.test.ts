import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

// 'use client' 组件的模块图不能触达 server-only 的 Supabase service 客户端。
// 一旦触达,该组件在 SSR bundle 里会解析成 undefined,整页请求 500
// (“Element type is invalid … got: undefined”,无组件栈),而客户端导航
// 正常——正是 /zh/finance-forecast 曾经踩过的坑:client 组件经
// lifecycle.ts / views.ts 间接 import 了 supabase/server。
// 这里静态扫描所有 client 组件的 @/ runtime import 闭包做防线。

const FORBIDDEN = path.join('src', 'lib', 'supabase', 'server.ts')
const SCAN_ROOTS = ['src/components', 'src/app']

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

function isUseClient(file: string): boolean {
  const head = fs.readFileSync(file, 'utf8').slice(0, 500)
  return /^\s*['"]use client['"]/.test(head)
}

// Type-only imports are erased by the compiler and never enter the runtime
// module graph, so they don't count as edges.
function isTypeOnlyClause(clause: string): boolean {
  const trimmed = clause.trim()
  if (trimmed.startsWith('type ') || trimmed.startsWith('type{')) return true
  const braced = trimmed.match(/^\{([\s\S]*)\}$/)
  if (!braced) return false
  return braced[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .every((s) => s.startsWith('type '))
}

function runtimeAliasImports(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8')
  const specs: string[] = []
  const edgeRe = /(?:^|\n)\s*(import|export)\s+([\s\S]*?)\s+from\s+['"](@\/[^'"]+)['"]|(?:^|\n)\s*import\s+['"](@\/[^'"]+)['"]/g
  for (let m = edgeRe.exec(source); m; m = edgeRe.exec(source)) {
    const spec = m[3] ?? m[4]
    if (!spec) continue
    if (m[2] !== undefined && isTypeOnlyClause(m[2])) continue
    specs.push(spec)
  }
  return specs
}

function resolveAlias(spec: string): string | null {
  const base = path.join('src', spec.slice(2))
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

// BFS over the runtime import graph, remembering parents to report the chain.
function findForbiddenChain(entry: string): string[] | null {
  const parents = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const spec of runtimeAliasImports(file)) {
      const resolved = resolveAlias(spec)
      if (!resolved || parents.has(resolved)) continue
      parents.set(resolved, file)
      if (resolved === FORBIDDEN) {
        const chain = [resolved]
        for (let at: string | null = file; at; at = parents.get(at) ?? null) chain.unshift(at)
        return chain
      }
      queue.push(resolved)
    }
  }
  return null
}

test('client components never (transitively) import the Supabase service client', () => {
  const clientComponents = SCAN_ROOTS.flatMap(listSourceFiles).filter(isUseClient)
  assert.ok(clientComponents.length > 0, 'expected to find use client components to scan')

  const violations = clientComponents
    .map((file) => findForbiddenChain(file))
    .filter((chain): chain is string[] => chain !== null)
    .map((chain) => chain.join('\n    → '))

  assert.deepEqual(
    violations,
    [],
    `client component module graph reaches ${FORBIDDEN} (breaks SSR module resolution):\n  ${violations.join('\n  ')}`,
  )
})
