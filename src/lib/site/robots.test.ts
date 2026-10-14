import assert from 'node:assert/strict'
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
