import test from 'node:test'
import assert from 'node:assert/strict'

import { dayZipName, shotExtension, shotFileName } from './shotDownload.ts'

test('shotExtension: 从 URL 末段取扩展名，统一小写', () => {
  assert.equal(shotExtension('https://x.supabase.co/a/b/c.webp'), 'webp')
  assert.equal(shotExtension('https://x.co/a/B.PNG'), 'png')
  assert.equal(shotExtension('https://x.co/a/b.jpeg'), 'jpeg')
})

test('shotExtension: 带 query / hash 不会把参数吃进扩展名', () => {
  // 存储 URL 上挂签名参数是常态，`webp?token=abc` 这种要能取到 webp
  assert.equal(shotExtension('https://x.co/a/b.webp?token=abc&x=1'), 'webp')
  assert.equal(shotExtension('https://x.co/a/b.webp#frag'), 'webp')
})

test('shotExtension: 取不到就退回 jpg，不返回空串', () => {
  // 空扩展名会拼出 `名字.` 这种文件，系统识别不了
  assert.equal(shotExtension('https://x.co/a/b'), 'jpg')
  assert.equal(shotExtension(''), 'jpg')
  assert.equal(shotExtension('https://x.co/a.b/c'), 'jpg', '点在目录名里不算扩展名')
})

test('shotExtension: 挡掉离谱的长度，避免路径段被整段当扩展名', () => {
  assert.equal(shotExtension('https://x.co/a/b.thisisnotanextension'), 'jpg')
})

test('shotFileName: 账号 + 日期 + 序号 + 扩展名', () => {
  const shot = { image_url: 'https://x.co/p/q.webp', shot_on: '2026-09-13' }
  assert.equal(shotFileName('1mb.fiora', shot, 0, 3), '1mb.fiora_2026-09-13_1.webp')
  assert.equal(shotFileName('1mb.fiora', shot, 2, 3), '1mb.fiora_2026-09-13_3.webp')
})

test('shotFileName: 当天只有一张就不加序号', () => {
  const shot = { image_url: 'https://x.co/p/q.webp', shot_on: '2026-09-13' }
  assert.equal(shotFileName('1mb.fiora', shot, 0, 1), '1mb.fiora_2026-09-13.webp')
})

test('shotFileName: 没标日期用 undated，不产出空段', () => {
  // 写成 `handle__1.webp` 那样的双下划线看起来像文件名坏了
  const shot = { image_url: 'https://x.co/p/q.png', shot_on: null }
  assert.equal(shotFileName('dear', shot, 0, 2), 'dear_undated_1.png')
})

test('shotFileName: 账号名里的文件系统禁用字符被换成下划线', () => {
  const shot = { image_url: 'https://x.co/p/q.webp', shot_on: '2026-09-13' }
  // handle 是对方平台上的用户名，我们不控制它的取值；/ 和 : 会让下载直接失败
  assert.equal(shotFileName('a/b:c*d?e', shot, 0, 1), 'a_b_c_d_e_2026-09-13.webp')
  assert.equal(shotFileName('  spaced  name ', shot, 0, 1), 'spaced_name_2026-09-13.webp')
})

test('shotFileName: 点和连字符是合法的，不该被换掉', () => {
  const shot = { image_url: 'https://x.co/p/q.webp', shot_on: '2026-09-13' }
  assert.equal(shotFileName('1mb.fiora-jp', shot, 0, 1), '1mb.fiora-jp_2026-09-13.webp')
})

test('shotFileName: 账号名为空时退回 shot，不产出以下划线开头的名字', () => {
  const shot = { image_url: 'https://x.co/p/q.webp', shot_on: '2026-09-13' }
  assert.equal(shotFileName('', shot, 0, 1), 'shot_2026-09-13.webp')
  assert.equal(shotFileName('///', shot, 0, 1), 'shot_2026-09-13.webp')
})

test('dayZipName: 账号 + 日期 + .zip', () => {
  assert.equal(dayZipName('1mb.fiora', '2026-09-13'), '1mb.fiora_2026-09-13.zip')
  assert.equal(dayZipName('dear', null), 'dear_undated.zip')
  assert.equal(dayZipName('a/b', '2026-09-13'), 'a_b_2026-09-13.zip')
})
