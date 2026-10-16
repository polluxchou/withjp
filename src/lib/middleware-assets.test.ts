import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { shouldBypassMiddlewareAsset } from './middleware-assets.ts'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    // .DS_Store 之类的系统文件不会被请求，也不随部署上线。
    if (name.startsWith('.')) return []
    const abs = join(dir, name)
    return statSync(abs).isDirectory() ? filesUnder(abs) : [abs]
  })
}

test('root app icon bypasses middleware when it reaches runtime guard', () => {
  assert.equal(shouldBypassMiddlewareAsset('/icon.svg'), true)
})

test('localized app pages still go through middleware runtime guard', () => {
  assert.equal(shouldBypassMiddlewareAsset('/zh/creators'), false)
})

test('Next 元数据路由与浏览器默认请求的文件直接放行', () => {
  for (const path of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/apple-touch-icon.png']) {
    assert.equal(shouldBypassMiddlewareAsset(path), true, path)
  }
})

test('public/ 下每个文件都放行（往 public/ 放新类型要同步加扩展名）', () => {
  const files = filesUnder(join(ROOT, 'public'))
  assert.ok(files.length > 0)
  for (const abs of files) {
    const path = '/' + relative(join(ROOT, 'public'), abs).split(sep).join('/')
    assert.equal(shouldBypassMiddlewareAsset(path), true, path)
  }
})

test('路径里有 . 但最后一段不是静态资源扩展名：照常过登录门', () => {
  for (const path of [
    '/zh/team.',
    '/zh/team.foo',
    '/zh/recruit-applications.bak',
    '/zh/creators/john.doe',
    '/zh/timeline/1.2',
    '/zh/a.png/team',
    '/zh/site.webp/recruit-applications',
    '/.well-known/x',
  ]) {
    assert.equal(shouldBypassMiddlewareAsset(path), false, path)
  }
})

test('扩展名大小写不敏感，但必须真的是最后一段的后缀', () => {
  assert.equal(shouldBypassMiddlewareAsset('/site/hero.WEBP'), true)
  assert.equal(shouldBypassMiddlewareAsset('/zh/team.webpx'), false)
  assert.equal(shouldBypassMiddlewareAsset('/zh/png'), false)
})

// middleware 链上不能再有别处按「路径里有 .」放行，否则上面的收窄白做。
test('middleware 与 updateSession 不再按 includes(".") 放行', () => {
  for (const rel of ['src/middleware.ts', 'src/lib/supabase/middleware.ts']) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    assert.doesNotMatch(src, /\.includes\(\s*['"]\.['"]\s*\)/, rel)
    assert.match(src, /shouldBypassMiddlewareAsset\(pathname\)/, rel)
  }
})
