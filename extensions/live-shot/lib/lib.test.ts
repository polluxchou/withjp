import assert from 'node:assert/strict'
import test from 'node:test'

import { cropRect } from './crop.js'
import { bumpShots, jstDay, shotsToday } from './day.js'
import { handleFromLiveUrl } from './liveUrl.js'
import { needsRefresh, sessionFromAuth } from './session.js'
import { readingState, uploadErrorMessage } from './view.js'

test('handleFromLiveUrl：只认 tiktok.com/@handle/live', () => {
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/@1MB.Dear/live?enter_from_merge=others_homepage'), '1mb.dear')
  assert.equal(handleFromLiveUrl('https://tiktok.com/@uni.chuuu/live/'), 'uni.chuuu')
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/@uni.chuuu'), null, '主页不算')
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/live'), null)
  assert.equal(handleFromLiveUrl('https://evil.example/@a/live'), null)
  assert.equal(handleFromLiveUrl('chrome://extensions'), null)
  assert.equal(handleFromLiveUrl('not a url'), null)
  assert.equal(handleFromLiveUrl(null), null)
})

test('handleFromLiveUrl：只认 https、路径必须恰好是 /@handle/live，坏编码不抛错', () => {
  assert.equal(handleFromLiveUrl('http://www.tiktok.com/@a/live'), null, '非 https 不算')
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/@a/live/xyz'), null, '多一段路径不算')
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/@%ZZ/live'), null, '坏的百分号编码返回 null 而不是抛错')
  assert.equal(handleFromLiveUrl('https://www.tiktok.com/@a%2Eb/live'), 'a.b')
})

test('cropRect：按位图宽/视口宽换算像素，不依赖 devicePixelRatio', () => {
  assert.deepEqual(cropRect({ x: 247, y: 0, width: 506, height: 900 }, 1600, 3200, 1800), { sx: 494, sy: 0, sw: 1012, sh: 1800 })
  assert.deepEqual(cropRect({ x: 10, y: 10, width: 100, height: 100 }, 1000, 1000, 800), { sx: 10, sy: 10, sw: 100, sh: 100 })
})

test('cropRect：越界裁到位图内；空矩形或参数非法返回 null', () => {
  assert.deepEqual(cropRect({ x: -10, y: 700, width: 200, height: 200 }, 1000, 1000, 800), { sx: 0, sy: 700, sw: 190, sh: 100 })
  assert.equal(cropRect({ x: 0, y: 0, width: 1, height: 1 }, 1000, 1000, 800), null)
  assert.equal(cropRect(null, 1000, 1000, 800), null)
  assert.equal(cropRect({ x: 0, y: 0, width: 100, height: 100 }, 0, 1000, 800), null)
})

test('cropRect：非整数比例下左右/上下边各自取整（不是 x 取整后加宽度）', () => {
  // scale = 3200 / 1280 = 2.5：x 247→617.5→618，右边 754→1885，宽 1267；y 13→32.5→33，下边超出位图裁到 2000，高 1967
  assert.deepEqual(cropRect({ x: 247, y: 13, width: 507, height: 899 }, 1280, 3200, 2000), { sx: 618, sy: 33, sw: 1267, sh: 1967 })
})

test('cropRect：画面一半以上在视口外 → null；坐标是 NaN → null', () => {
  assert.equal(cropRect({ x: 0, y: 700, width: 100, height: 300 }, 1000, 1000, 800), null, '300px 高只露出 100px')
  assert.equal(cropRect({ x: NaN, y: 0, width: 10, height: 10 }, 1000, 1000, 800), null)
})

test('jstDay：日本时间自然日', () => {
  assert.equal(jstDay(Date.UTC(2026, 9, 8, 14, 59)), '2026-10-08')
  assert.equal(jstDay(Date.UTC(2026, 9, 8, 15, 0)), '2026-10-09')
})

test('今日截图计数：同一天累加，跨天归零', () => {
  const d1 = Date.UTC(2026, 9, 9, 3, 0)
  const d2 = Date.UTC(2026, 9, 9, 16, 0) // 日本时间已是 10-10
  assert.equal(shotsToday(null, d1), 0)
  const a = bumpShots(null, d1)
  const b = bumpShots(a, d1)
  assert.deepEqual(b, { day: '2026-10-09', shots: 2 })
  assert.equal(shotsToday(b, d2), 0)
  assert.deepEqual(bumpShots(b, d2), { day: '2026-10-10', shots: 1 })
})

test('今日截图计数：存储里的负数当作 0', () => {
  const now = Date.UTC(2026, 9, 9, 3, 0)
  assert.equal(shotsToday({ day: '2026-10-09', shots: -5 }, now), 0)
})

test('sessionFromAuth：取令牌与过期时刻，缺字段返回 null', () => {
  const now = 1_760_000_000_000
  assert.deepEqual(
    sessionFromAuth({ access_token: 'a', refresh_token: 'r', expires_at: 1_760_007_200, user: { email: 'x@y.z' } }, now),
    { accessToken: 'a', refreshToken: 'r', expiresAt: 1_760_007_200_000, email: 'x@y.z' },
  )
  assert.equal(sessionFromAuth({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, now)?.expiresAt, now + 3_600_000)
  assert.equal(sessionFromAuth({ error: 'invalid_grant' }, now), null)
  assert.equal(sessionFromAuth(null, now), null)
})

test('needsRefresh：过期前 60 秒就续', () => {
  const now = 1_000_000
  assert.equal(needsRefresh({ expiresAt: now + 120_000 }, now), false)
  assert.equal(needsRefresh({ expiresAt: now + 30_000 }, now), true)
  assert.equal(needsRefresh(null, now), true)
  assert.equal(needsRefresh({ expiresAt: undefined }, now), true, '缺过期时刻 → 当作要续')
  assert.equal(needsRefresh({}, now), true)
})

const READY = {
  href: 'https://www.tiktok.com/@a/live?x=1',
  visualScale: 1,
  clip: { ready: true, clip: { x: 0, y: 0, width: 10, height: 10 } },
  viewer: '99',
}

test('readingState：不是直播间 / 没有画面 / 就绪（人数缺失时 viewerOk=false）', () => {
  assert.deepEqual(readingState(null, READY), { kind: 'error', message: '当前页不是直播间' })
  assert.deepEqual(readingState('a', { ...READY, clip: { ready: false, clip: null } }), { kind: 'error', message: '没找到直播画面' })
  assert.deepEqual(readingState('a', null), { kind: 'error', message: '没找到直播画面' })
  assert.deepEqual(readingState('a', READY), { kind: 'ready', viewerOk: true })
  assert.deepEqual(readingState('a', { ...READY, viewer: null }), { kind: 'ready', viewerOk: false })
})

test('readingState：页内读到的网址与标签页对不上 → 页面刚切换，要求重试', () => {
  assert.deepEqual(readingState('a', { ...READY, href: 'https://www.tiktok.com/@b/live' }), { kind: 'error', message: '页面刚切换了直播间，请重试' })
  assert.deepEqual(readingState('a', { ...READY, href: null }), { kind: 'error', message: '页面刚切换了直播间，请重试' })
})

test('readingState：页面被双指缩放 → 拒截（截图与元素坐标对不上）', () => {
  assert.deepEqual(readingState('a', { ...READY, visualScale: 1.5 }), { kind: 'error', message: '请先把页面缩放恢复到 100%' })
  assert.deepEqual(readingState('a', { ...READY, visualScale: 1.0005 }), { kind: 'ready', viewerOk: true }, '浮点误差内不算缩放')
  assert.deepEqual(readingState('a', { ...READY, visualScale: 1.005 }), { kind: 'error', message: '请先把页面缩放恢复到 100%' })
  assert.deepEqual(readingState('a', { ...READY, visualScale: 0.9 }), { kind: 'error', message: '请先把页面缩放恢复到 100%' })
})

test('readingState：缩放读数缺失或是 NaN → 失败即拒（字段改名也不会悄悄放行）', () => {
  const { visualScale: _omit, ...noScale } = READY
  assert.deepEqual(readingState('a', noScale), { kind: 'error', message: '请先把页面缩放恢复到 100%' })
  assert.deepEqual(readingState('a', { ...READY, visualScale: undefined }), { kind: 'error', message: '请先把页面缩放恢复到 100%' })
  assert.deepEqual(readingState('a', { ...READY, visualScale: NaN }), { kind: 'error', message: '请先把页面缩放恢复到 100%' })
})

test('readingState：网址大小写 / 查询串 / hash 不同不算切房；人数为空串 → viewerOk=false', () => {
  assert.deepEqual(readingState('a', { ...READY, href: 'https://tiktok.com/@A/live/?lang=ja#x' }), { kind: 'ready', viewerOk: true })
  assert.deepEqual(readingState('a', { ...READY, viewer: '' }), { kind: 'ready', viewerOk: false })
})

test('uploadErrorMessage：后台错误码 → 一句话', () => {
  assert.equal(uploadErrorMessage('not_in_library', 'heroangels_'), '@heroangels_ 不在竞品库')
  assert.equal(uploadErrorMessage('unauthorized', 'a'), '登录已过期，请重新登录')
  assert.equal(uploadErrorMessage('invalid_type', 'a'), '截图格式或大小不符')
  assert.equal(uploadErrorMessage('file_too_large', 'a'), '截图格式或大小不符')
  assert.equal(uploadErrorMessage('db_error', 'a'), '上传失败，可以重试')
})

test('cropRect：y 方向同样逐边取整；水平方向一半以上出视口也拒', () => {
  // 尺寸取整会得到 sh 1268（多裁一行），逐边取整是 1267
  assert.deepEqual(cropRect({ x: 247, y: 13, width: 507, height: 507 }, 1280, 3200, 2000), { sx: 618, sy: 33, sw: 1267, sh: 1267 })
  assert.equal(cropRect({ x: 900, y: 0, width: 300, height: 100 }, 1000, 1000, 800), null)
})

test('今日截图计数：存储被写坏成字符串时归零，不会把 "3"+1 拼成 "31"', () => {
  const now = Date.UTC(2026, 9, 9, 3, 0)
  assert.equal(shotsToday({ day: jstDay(now), shots: '3' }, now), 0)
  assert.deepEqual(bumpShots({ day: jstDay(now), shots: '3' }, now), { day: jstDay(now), shots: 1 })
})
