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

// delayMs：响应延后若干毫秒才返回，用来制造「请求还在路上」的并发窗口
type Route = { status: number; json: unknown; delayMs?: number }
// 路由值可以是数组：按调用顺序逐个消费，用完后重复最后一个
type Routes = Record<string, Route | Route[]>
type Call = { url: string; init: RequestInit }

function fakeFetch(routes: Routes) {
  const calls: Call[] = []
  const used: Record<string, number> = {}
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const key = Object.keys(routes).find((k) => url.includes(k))
    let r: Route = { status: 404, json: {} }
    if (key) {
      const entry = routes[key]
      const seq = Array.isArray(entry) ? entry : [entry]
      const i = used[key] ?? 0
      used[key] = i + 1
      r = seq[Math.min(i, seq.length - 1)]
    }
    if (r.delayMs) await new Promise((resolve) => setTimeout(resolve, r.delayMs))
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json }
  }
  return { calls, impl: impl as unknown as typeof fetch }
}

const throwingFetch = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch

const CFG = { apiBase: 'https://mcn.example', supabaseUrl: 'https://p.supabase.co', anonKey: 'anon' }
const BACKEND = '/api/competitors/quick-shot'
// expires_at 刻意不等于 expires_in 的默认兜底（NOW+3600s），免得删掉 expires_at 分支测试照样过
const AUTH_OK = { access_token: 'acc', refresh_token: 'ref', expires_at: NOW / 1000 + 7200 }
// 续期返回新的 access / refresh token（Supabase 会轮换 refresh token）
const AUTH_ROTATED = { access_token: 'acc2', refresh_token: 'ref2', expires_at: NOW / 1000 + 7200 }

const VALID = { session: { accessToken: 'acc', refreshToken: 'ref', expiresAt: NOW + 3_600_000 } }
const EXPIRING = { session: { accessToken: 'old', refreshToken: 'ref', expiresAt: NOW + 10_000 } }
const EMPTY_READING = { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null }

function headersOf(call: Call) {
  return call.init.headers as Record<string, string>
}

test('login：成功返回 ok，存会话、不存密码，带 anon key', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({ 'grant_type=password': { status: 200, json: AUTH_OK } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'pw'), 'ok')
  const s = storage.data.session as { accessToken: string; expiresAt: number }
  assert.equal(s.accessToken, 'acc')
  assert.equal(s.expiresAt, NOW + 7_200_000)
  assert.ok(!JSON.stringify(storage.data).includes('pw'), '密码不落盘')
  assert.equal(f.calls[0].url, 'https://p.supabase.co/auth/v1/token?grant_type=password')
  assert.equal(headersOf(f.calls[0]).apikey, 'anon')
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { email: 'a@b.c', password: 'pw' })
})

test('login：4xx（密码错）→ rejected，不存东西', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({ 'grant_type=password': { status: 400, json: { error: 'invalid_grant' } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'bad'), 'rejected')
  assert.equal(storage.data.session, undefined)
})

test('login：fetch 抛错 → network，不存东西', async () => {
  const storage = memoryStorage()
  const api = createApi({ ...CFG, storage, fetchImpl: throwingFetch, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'pw'), 'network')
  assert.equal(storage.data.session, undefined)
})

test('login：503 / 429 → network（暂时性），不存东西', async () => {
  for (const status of [503, 429]) {
    const storage = memoryStorage()
    const f = fakeFetch({ 'grant_type=password': { status, json: {} } })
    const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
    assert.equal(await api.login('a@b.c', 'pw'), 'network', `status ${status}`)
    assert.equal(storage.data.session, undefined)
  }
})

test('login：200 但返回体残缺 → network，不存东西', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({ 'grant_type=password': { status: 200, json: { foo: 1 } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal(await api.login('a@b.c', 'pw'), 'network')
  assert.equal(storage.data.session, undefined)
})

test('session：未过期直接用，不发请求', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({})
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal((await api.session())?.accessToken, 'acc')
  assert.equal(f.calls.length, 0)
})

test('session：快过期时用 refresh token 续期，轮换后的新 refresh token 存回', async () => {
  const storage = memoryStorage(EXPIRING)
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 200, json: AUTH_ROTATED } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const s = await api.session()
  assert.equal(s?.accessToken, 'acc2')
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { refresh_token: 'ref' })
  const stored = storage.data.session as { accessToken: string; refreshToken: string }
  assert.equal(stored.accessToken, 'acc2')
  assert.equal(stored.refreshToken, 'ref2')
})

test('session：续期被明确拒绝（400）→ 清空会话（弹窗回到登录）', async () => {
  const storage = memoryStorage(EXPIRING)
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 400, json: {} } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal(await api.session(), null)
  assert.equal(storage.data.session, undefined)
})

test('session：续期时断网（fetch 抛错）→ 不算登出，返回旧会话，存储原样保留', async () => {
  const storage = memoryStorage(EXPIRING)
  const api = createApi({ ...CFG, storage, fetchImpl: throwingFetch, now: () => NOW })
  assert.deepEqual(await api.session(), EXPIRING.session)
  assert.deepEqual(storage.data.session, EXPIRING.session)
})

test('session：续期遇到 503 → 不算登出，返回旧会话；随后上传报 network_error 且不请求后端', async () => {
  const storage = memoryStorage(EXPIRING)
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 503, json: {} } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.deepEqual(await api.session(), EXPIRING.session)
  assert.deepEqual(storage.data.session, EXPIRING.session)
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 0)
  assert.equal(r.body.error, 'network_error')
  assert.equal(f.calls.filter((c) => c.url.includes(BACKEND)).length, 0, '没发后端请求')
  assert.deepEqual(storage.data.session, EXPIRING.session)
})

test('upload：带 Bearer 令牌，表单字段齐全，且不手写 Content-Type（让 FormData 自带 boundary）', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({ [BACKEND]: { status: 201, json: { data: { shot_id: 's' }, error: null } } })
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
  assert.equal(headersOf(call).Authorization, 'Bearer acc')
  assert.equal(headersOf(call)['Content-Type'], undefined)
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
  const storage = memoryStorage(VALID)
  const f = fakeFetch({ [BACKEND]: { status: 201, json: { data: {}, error: null } } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  await api.upload({ blob: new Blob([], { type: 'image/webp' }), handle: 'a', reading: EMPTY_READING })
  const form = f.calls[0].init.body as FormData
  assert.equal(form.get('viewer_text'), null)
  assert.equal(form.get('viewer_source'), null)
  assert.equal(form.get('co_live'), '[]')
})

test('upload：非 JSON 响应（如网关 413/504 的 HTML）→ 保留状态码，body.error 为 bad_response', async () => {
  const storage = memoryStorage(VALID)
  const html = (async () => ({ ok: false, status: 413, json: async () => { throw new SyntaxError('Unexpected token <') } })) as unknown as typeof fetch
  const api = createApi({ ...CFG, storage, fetchImpl: html, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 413)
  assert.equal(r.body.error, 'bad_response')
})

test('upload：响应是合法 JSON 但不是对象（null）→ body 恒为对象 { data: null, error: bad_response }', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({ [BACKEND]: { status: 502, json: null } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 502)
  assert.deepEqual(r.body, { data: null, error: 'bad_response' })
})

test('upload：响应是合法 JSON 但是数组 → 同样归一成 { data: null, error: bad_response }', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({ [BACKEND]: { status: 502, json: [1] } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 502)
  assert.deepEqual(r.body, { data: null, error: 'bad_response' })
})

test('upload：网络断开（fetch 抛错）→ 状态码 0，不向外抛', async () => {
  const storage = memoryStorage(VALID)
  const api = createApi({ ...CFG, storage, fetchImpl: throwingFetch, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 0)
  assert.equal(r.body.error, 'network_error')
})

test('没有会话时调用接口 → 直接给 401，不发请求', async () => {
  const f = fakeFetch({})
  const api = createApi({ ...CFG, storage: memoryStorage(), fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 401)
  assert.equal(f.calls.length, 0)
})

test('upload：后端 401（如本地时钟偏慢）→ 强制续期后用新令牌重发一次', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({
    'grant_type=refresh_token': { status: 200, json: AUTH_ROTATED },
    [BACKEND]: [
      { status: 401, json: { data: null, error: 'unauthorized' } },
      { status: 201, json: { data: { shot_id: 's' }, error: null } },
    ],
  })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([new Uint8Array(4)], { type: 'image/webp' }), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 201)
  const backend = f.calls.filter((c) => c.url.includes(BACKEND))
  assert.equal(backend.length, 2)
  assert.equal(headersOf(backend[0]).Authorization, 'Bearer acc')
  assert.equal(headersOf(backend[1]).Authorization, 'Bearer acc2')
  // 重发的是同一份表单（同一读数时刻、同一 handle）：不会因为重试变成另一条截图
  assert.equal(backend[1].init.body, backend[0].init.body, '两次请求体是同一个 FormData 对象')
  assert.equal((backend[1].init.body as FormData).get('captured_at'), String(NOW))
  assert.equal((backend[1].init.body as FormData).get('handle'), 'a')
  const refresh = f.calls.filter((c) => c.url.includes('grant_type=refresh_token'))
  assert.equal(refresh.length, 1)
  assert.deepEqual(JSON.parse(String(refresh[0].init.body)), { refresh_token: 'ref' })
  assert.equal((storage.data.session as { refreshToken: string }).refreshToken, 'ref2')
})

test('upload：后端 401 且续期被拒绝（400）→ 返回 401，会话清空，只请求后端一次', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({
    'grant_type=refresh_token': { status: 400, json: {} },
    [BACKEND]: { status: 401, json: { data: null, error: 'unauthorized' } },
  })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 401)
  assert.equal(storage.data.session, undefined)
  assert.equal(f.calls.filter((c) => c.url.includes(BACKEND)).length, 1)
})

test('upload：后端 401 且续期暂时失败（503）→ network_error，会话保留', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({
    'grant_type=refresh_token': { status: 503, json: {} },
    [BACKEND]: { status: 401, json: { data: null, error: 'unauthorized' } },
  })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 0)
  assert.equal(r.body.error, 'network_error')
  assert.deepEqual(storage.data.session, VALID.session)
  assert.equal(f.calls.filter((c) => c.url.includes(BACKEND)).length, 1)
})

test('upload：401 只重试一次——续期成功但后端仍 401 → 返回 401，后端恰好 2 次，不死循环', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({
    'grant_type=refresh_token': { status: 200, json: AUTH_ROTATED },
    [BACKEND]: { status: 401, json: { data: null, error: 'unauthorized' } },
  })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  assert.equal(r.status, 401)
  assert.equal(f.calls.filter((c) => c.url.includes(BACKEND)).length, 2)
})

test('todayUploads：200 取数，其它返回 null（即使 500 的响应体里带着数字也不采信）', async () => {
  const storage = memoryStorage(VALID)
  const ok = fakeFetch({ [BACKEND]: { status: 200, json: { data: { today_uploads: 5 }, error: null } } })
  assert.equal(await createApi({ ...CFG, storage, fetchImpl: ok.impl, now: () => NOW }).todayUploads(), 5)
  assert.equal(ok.calls[0].init.method, 'GET')
  assert.equal(headersOf(ok.calls[0]).Authorization, 'Bearer acc')
  const bad = fakeFetch({ [BACKEND]: { status: 500, json: {} } })
  assert.equal(await createApi({ ...CFG, storage, fetchImpl: bad.impl, now: () => NOW }).todayUploads(), null)
  const lying = fakeFetch({ [BACKEND]: { status: 500, json: { data: { today_uploads: 9 } } } })
  assert.equal(await createApi({ ...CFG, storage, fetchImpl: lying.impl, now: () => NOW }).todayUploads(), null)
})

test('并发续期共用一次请求：session / todayUploads / session 同时进来只发一次 refresh，之后还能再续', async () => {
  const storage = memoryStorage(EXPIRING)
  const f = fakeFetch({
    'grant_type=refresh_token': { status: 200, json: AUTH_ROTATED, delayMs: 5 },
    [BACKEND]: { status: 200, json: { data: { today_uploads: 3 }, error: null } },
  })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const refreshCalls = () => f.calls.filter((c) => c.url.includes('grant_type=refresh_token'))

  const [s1, count, s2] = await Promise.all([api.session(), api.todayUploads(), api.session()])
  assert.equal(refreshCalls().length, 1, '同一时刻只发一次续期')
  assert.equal(s1?.accessToken, 'acc2')
  assert.equal(s2?.accessToken, 'acc2')
  assert.equal(count, 3)
  const backend = f.calls.filter((c) => c.url.includes(BACKEND))
  assert.equal(headersOf(backend[0]).Authorization, 'Bearer acc2', 'todayUploads 用的是续期后的新令牌')
  assert.equal((storage.data.session as { accessToken: string; refreshToken: string }).accessToken, 'acc2')
  assert.equal((storage.data.session as { accessToken: string; refreshToken: string }).refreshToken, 'ref2')

  // 续期落定后飞行标记要复位：轮换后的会话（ref2）再次快过期时，能发起第二次续期
  storage.data.session = { accessToken: 'acc2', refreshToken: 'ref2', expiresAt: NOW + 10_000 }
  assert.equal((await api.session())?.accessToken, 'acc2')
  assert.equal(refreshCalls().length, 2)
  assert.deepEqual(JSON.parse(String(refreshCalls()[1].init.body)), { refresh_token: 'ref2' })
})

test('单飞：暂时性失败之后飞行标记也会复位，下一次 session() 能重新发起续期', async () => {
  const storage = memoryStorage(EXPIRING)
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 200, json: AUTH_ROTATED } })
  let attempts = 0
  let broken = true
  const flaky = (async (url: string, init: RequestInit) => {
    attempts += 1
    if (broken) throw new TypeError('Failed to fetch')
    return (f.impl as unknown as (u: string, i: RequestInit) => Promise<Response>)(url, init)
  }) as unknown as typeof fetch
  const api = createApi({ ...CFG, storage, fetchImpl: flaky, now: () => NOW })

  assert.deepEqual(await api.session(), EXPIRING.session, '断网：返回旧会话')
  assert.equal(attempts, 1)
  assert.deepEqual(storage.data.session, EXPIRING.session)

  broken = false
  const s = await api.session()
  assert.equal(attempts, 2, '第二次调用重新发起了续期')
  assert.equal(s?.accessToken, 'acc2')
  assert.equal((storage.data.session as { refreshToken: string }).refreshToken, 'ref2')
})

test('单飞：普通续期进行中，另一个请求吃到 401 触发强制续期 → 共用同一次续期，重发带新令牌', async () => {
  let t = NOW
  const storage = memoryStorage(VALID)
  const f = fakeFetch({
    'grant_type=refresh_token': { status: 200, json: AUTH_ROTATED, delayMs: 60 },
    [BACKEND]: [
      { status: 401, json: { data: null, error: 'unauthorized' }, delayMs: 20 },
      { status: 201, json: { data: { shot_id: 's' }, error: null } },
    ],
  })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => t })
  // 会话此刻有效：upload 带旧令牌发出，401 要 20ms 后才回来
  const uploading = api.upload({ blob: new Blob([]), handle: 'a', reading: EMPTY_READING })
  await new Promise((resolve) => setTimeout(resolve, 5))
  // 时间走到快过期，另一个调用发起普通续期（60ms 才回），401 到达时它还在飞
  t = NOW + 3_600_000 - 10_000
  const [r, s] = await Promise.all([uploading, api.session()])

  assert.equal(r.status, 201)
  assert.equal(s?.accessToken, 'acc2')
  assert.equal(f.calls.filter((c) => c.url.includes('grant_type=refresh_token')).length, 1, '强制续期并入了飞行中的那一次')
  const backend = f.calls.filter((c) => c.url.includes(BACKEND))
  assert.equal(backend.length, 2)
  assert.equal(headersOf(backend[0]).Authorization, 'Bearer acc')
  assert.equal(headersOf(backend[1]).Authorization, 'Bearer acc2')
})

test('读存储与续期完成之间的窗口：读到刚被轮换掉的旧会话 → 用内存里的新会话，不再拿旧 refresh token 续期', async () => {
  const base = memoryStorage(EXPIRING)
  let replayOld = false
  // 模拟 chrome.storage 的异步读：续期落盘之前发出的那次读，晚一步才返回旧值
  const storage = {
    ...base,
    get: async (k: string) => {
      if (replayOld) {
        replayOld = false
        return EXPIRING.session
      }
      return base.get(k)
    },
  }
  const f = fakeFetch({ 'grant_type=refresh_token': { status: 200, json: AUTH_ROTATED } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const refreshCalls = () => f.calls.filter((c) => c.url.includes('grant_type=refresh_token'))

  assert.equal((await api.session())?.accessToken, 'acc2')
  assert.equal(refreshCalls().length, 1)

  replayOld = true
  const s = await api.session()
  assert.equal(s?.accessToken, 'acc2', '拿到的是新会话')
  assert.equal(refreshCalls().length, 1, '没有再拿旧 refresh token 去续期')
})

test('logout：先带 Bearer 令牌请求服务端吊销（/auth/v1/logout），再清掉本地会话', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({ '/auth/v1/logout': { status: 204, json: null } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  await api.logout()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].url, 'https://p.supabase.co/auth/v1/logout')
  assert.equal(f.calls[0].init.method, 'POST')
  assert.equal(headersOf(f.calls[0]).Authorization, 'Bearer acc')
  assert.equal(headersOf(f.calls[0]).apikey, 'anon')
  assert.equal(storage.data.session, undefined)
})

test('logout：吊销请求抛错（断网）也照样清掉本地会话，不向外抛', async () => {
  const storage = memoryStorage(VALID)
  const api = createApi({ ...CFG, storage, fetchImpl: throwingFetch, now: () => NOW })
  await api.logout()
  assert.equal(storage.data.session, undefined)
})

test('logout：服务端拒绝（500）也照样清掉本地会话', async () => {
  const storage = memoryStorage(VALID)
  const f = fakeFetch({ '/auth/v1/logout': { status: 500, json: {} } })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  await api.logout()
  assert.equal(storage.data.session, undefined)
})

test('logout：本来就没有会话 → 不发任何请求', async () => {
  const storage = memoryStorage()
  const f = fakeFetch({})
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  await api.logout()
  assert.equal(f.calls.length, 0)
  assert.equal(storage.data.session, undefined)
})

// ---- 会话失效后不得从内存「复活」 ---------------------------------------------
const EXPIRING_SESSION = { session: { accessToken: 'old', refreshToken: 'ref', expiresAt: NOW + 10_000 } }
const ROTATED = { status: 200, json: { access_token: 'acc2', refresh_token: 'ref2', expires_at: NOW / 1000 + 7200 } }

test('轮换后 logout → session() 为 null，内存里的新会话不复活', async () => {
  const storage = memoryStorage(EXPIRING_SESSION)
  const f = fakeFetch({ 'grant_type=refresh_token': ROTATED })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  assert.equal((await api.session())?.accessToken, 'acc2')
  await api.logout()
  assert.equal(await api.session(), null)
  assert.equal(storage.data.session, undefined)
})

test('轮换后强制续期被拒（401 重试路径）→ 会话清空，之后 session() 为 null', async () => {
  const storage = memoryStorage(EXPIRING_SESSION)
  const f = fakeFetch({
    'grant_type=refresh_token': [ROTATED, { status: 400, json: {} }],
    '/api/competitors/quick-shot': { status: 401, json: { data: null, error: 'unauthorized' } },
  })
  const api = createApi({ ...CFG, storage, fetchImpl: f.impl, now: () => NOW })
  const r = await api.upload({ blob: new Blob([]), handle: 'a', reading: { capturedAt: NOW, viewer: null, viewerSource: null, coLive: null } })
  assert.equal(r.status, 401)
  assert.equal(await api.session(), null)
  assert.equal(storage.data.session, undefined)
})
