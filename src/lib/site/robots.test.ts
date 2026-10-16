import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { PUBLIC_SITE_HOSTS } from './domain-routing.ts'
import { buildRobots } from './robots.ts'

const ALLOW = {
  rules: { userAgent: '*', allow: '/' },
  sitemap: 'https://eacn.agenova.chat/sitemap.xml',
}
const DISALLOW = { rules: { userAgent: '*', disallow: '/' } }

// 这条判错的后果是官网整站被撤出 Google，所以把 Host 头可能出现的写法都过一遍。
test('官网域名的各种写法都允许抓取并给出 sitemap', () => {
  for (const host of PUBLIC_SITE_HOSTS) {
    for (const variant of [host, host.toUpperCase(), `${host}.`, `${host}:443`]) {
      assert.deepEqual(buildRobots(variant), ALLOW, variant)
    }
  }
})

test('内部域名、预览部署、本地、缺 host 一律禁止抓取', () => {
  for (const host of [
    'mcn.agenova.chat',
    'withjp-git-feat-x-example.vercel.app',
    'localhost:3001',
    '',
    null,
  ]) {
    assert.deepEqual(buildRobots(host), DISALLOW, String(host))
  }
})

// src/app/robots.ts 的接线没有运行时测试环境，只能钉源码：它必须每次请求按 Host 现算。
// 一旦被静态化（force-static、加 revalidate），构建期 headers() 拿不到 host，所有
// 域名——包括官网——都会拿到 Disallow: /，官网整站被撤出搜索结果，而 tsc、单测、
// next build 全是绿的。
const ROBOTS_ROUTE = 'src/app/robots.ts'

test('robots 路由每次请求按 Host 现算，不能被静态化', () => {
  const src = fs.readFileSync(ROBOTS_ROUTE, 'utf8')
  assert.match(src, /export const dynamic = 'force-dynamic'/, `${ROBOTS_ROUTE}: 必须 force-dynamic`)
  assert.match(src, /buildRobots\(\(await headers\(\)\)\.get\('host'\)\)/, `${ROBOTS_ROUTE}: 必须用请求的 Host 头判定`)
  assert.doesNotMatch(src, /force-static|export const revalidate/, `${ROBOTS_ROUTE}: 不能静态化或加 revalidate`)
})
