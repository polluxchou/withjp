import assert from 'node:assert/strict'
import test from 'node:test'

import { createApi } from './api.js'

const NOW = 1_760_000_000_000

function memoryStorage(init: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...init }
  return {
    data,
    get: async (k: string) => data[k] ?? null,
    set: async (k: string, v: unknown) => { data[k] = v },
    remove: async (k: string) => { delete data[k] },
  }
}

type Call = { url: string; init: RequestInit }
function fakeFetch(routes: Record<string, { status: number; json: unknown }>) {
  const calls: Call[] = []
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const key = Object.keys(routes).find((k) => url.includes(k))
    const r = key ? routes[key] : { status: 404, json: {} }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json }
  }
  return { calls, impl: impl as unknown as typeof fetch }
}

const CFG = { apiBase: 'https://mcn.example', supabaseUrl: 'https://p.supabase.co', anonKey: 'anon' }
// expires_at 刻意不等于 expires_in 的默认兜底（NOW+3600s），免得删掉 expires_at 分支测试照样过
const AUTH_OK = { access_token: 'acc', refresh_token: 'ref', expires_at: NOW / 1000 + 7200 }

test('login：成功存会话、不存密码，带 anon key', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({ 'grant_type=password': { status: 200, json: AUTH_OK } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'pw'), true)
  const s = storage.data.session as { accessToken: string; expiresAt: number }
  assert.equal(s.accessToken, 'acc')
  assert.equal(s.expiresAt, NOW + 7_200_000)
  assert.ok(!JSON.stringify(storage.data).includes('pw'), '密码不落盘')
  assert.equal(f.calls[0].url, 'https://p.supabase.co/auth/v1/token?grant_type=password')
  assert.equal((f.calls[0].init.headers as Record<string, string>).apikey, 'anon')
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { email: 'a@b.c', password: 'pw' })
})

test('login：失败不存东西', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({ 'grant_type=password': { status: 400, json: { error: 'invalid_grant' } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'bad'), false)
  assert.equal(storage.data.session, undefined)
})

test('session：未过期直接用，不发请求', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const f = fakeFetch({})
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal((await api.session())?.accessToken, 'acc')
  assert.equal(f.calls.length, 0)
})

test('session：快过期时用 refresh token 续期并存回', async () => {
  const storage = memoryStorage({ session: { accessToken: 'old', refreshToken: 'ref', expiresAt: NOW + 10_000 } })
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 200, json: AUTH_OK } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const s = await api.session()
  assert.equal(s?.accessToken, 'acc')
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { refresh_token: 'ref' })
  assert.equal((storage.data.session as { accessToken: string }).accessToken, 'acc')
})

test('session：续期失败清空会话（弹窗回到登录）', async () => {
  const storage = memoryStorage({ session: { accessToken: 'old', refreshToken: 'ref', expiresAt: NOW + 10_000 } })
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 400, json: {} } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal(await api.session(), null)
  assert.equal(storage.data.session, undefined)
})

test('session：网络异常（fetch 抛错）时也清空会话、不向外抛', async () => {
  const storage = memoryStorage({ session: { accessToken: 'old', refreshToken: 'ref', expiresAt: NOW + 10_000 } })
  const throwing = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
  const api = createApi({ ...CFG, storage, fetchImpl: throwing, now: () => NOW })
  assert.equal(await api.session(), null)
})

test('upload：带 Bearer 令牌，表单字段齐全', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const f = fakeFetch({ '/api/competitors/quick-shot': { status: 201, json: { data: { shot_id: 's' }, error: null } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const blob = new Blob([new Uint8Array(4)], { type: 'image/webp' })
  const r = await api.upload({
    blob,
    handle: '1mb.dear',
    reading: { capturedAt: NOW, viewer: '99', viewerSource: 'room', coLive: [{ handle: 'uni.chuuu', viewer: '64' }] },
  })
  assert.equal(r.status, 201)
  const call = f.calls[0]
  assert.equal(call.url, 'https://mcn.example/api/competitors/quick-shot')
  assert.equal(call.init.method, 'POST')
  assert.equal((call.init.headers as Record<string, string>).Authorization, 'Bearer acc')
  const form = call.init.body as FormData
  assert.equal(form.get('handle'), '1mb.dear')
  assert.equal(form.get('captured_at'), String(NOW))
  assert.equal(form.get('viewer_text'), '99')
  assert.equal(form.get('viewer_source'), 'room')
  assert.equal(form.get('co_live'), JSON.stringify([{ handle: 'uni.chuuu', viewer: '64' }]))
  assert.equal((form.get('file') as File).type, 'image/webp')
  assert.equal((form.get('file') as File).name, '1mb.dear.webp')
})

test('upload：人数没读到就不带 viewer 字段，co_live 为空数组', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const f = fakeFetch({ '/api/competitors/quick-shot': { status: 201, json: { data: {}, error: null } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  await api.upload({ blob: new Blob([], { type: 'image/webp' }), handle: 'a', reading: { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null } })
  const form = f.calls[0].init.body as FormData
  assert.equal(form.get('viewer_text'), null)
  assert.equal(form.get('viewer_source'), null)
  assert.equal(form.get('co_live'), '[]')
})

test('upload：非 JSON 响应（如网关 413/504 的 HTML）→ 保留状态码，body.error 为 bad_response', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const html = (async () => ({ ok: false, status: 413, json: async () => { throw new SyntaxError('Unexpected token <') } })) as unknown as typeof fetch
  const api = createApi({ ...CFG, storage, fetchImpl: html, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null } })
  assert.equal(r.status, 413)
  assert.equal(r.body.error, 'bad_response')
})

test('upload：网络断开（fetch 抛错）→ 状态码 0，不向外抛', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const throwing = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
  const api = createApi({ ...CFG, storage, fetchImpl: throwing, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null } })
  assert.equal(r.status, 0)
  assert.equal(r.body.error, 'network_error')
})

test('没有会话时调用接口 → 直接给 401，不发请求', async () => {
  const f = fakeFetch({})
  const api = createApi({ ...CFG, storage: memoryStorage(), fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null } })
  assert.equal(r.status, 401)
  assert.equal(f.calls.length, 0)
})

test('todayUploads：200 取数，其它返回 null', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const ok = fakeFetch({ '/api/competitors/quick-shot': { status: 200, json: { data: { today_uploads: 5 }, error: null } } })
  assert.equal(await createApi({ ...CFG, storage, fetchImpl: ok.impl, now: () => NOW }).todayUploads(), 5)
  assert.equal(ok.calls[0].init.method, 'GET')
  assert.equal((ok.calls[0].init.headers as Record<string, string>).Authorization, 'Bearer acc')
  const bad = fakeFetch({ '/api/competitors/quick-shot': { status: 500, json: {} } })
  assert.equal(await createApi({ ...CFG, storage, fetchImpl: bad.impl, now: () => NOW }).todayUploads(), null)
})

test('logout：清掉会话', async () => {
  const storage = memoryStorage({ session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } })
  const api = createApi({ ...CFG, storage, fetchImpl: fakeFetch({}).impl, now: () => NOW })
  await api.logout()
  assert.equal(storage.data.session, undefined)
})
