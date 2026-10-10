// 扩展与后台 / Supabase 的全部网络交互。fetch 与存储都可注入，便于 node 测试。
// 会话只存令牌（chrome.storage.local），密码只在 login() 的这一次请求里出现。
// 网络异常一律不向外抛：会话类返回 null / 'network'，接口类返回 { status: 0, body: { error: 'network_error' } }，
// 弹窗据此显示一句话，不会卡在「读取中」。
import { needsRefresh, sessionFromAuth } from './session.js'

const SESSION_KEY = 'session'
const QUICK_SHOT_PATH = '/api/competitors/quick-shot'

const networkError = () => ({ status: 0, body: { data: null, error: 'network_error' } })

export function createApi({ apiBase, supabaseUrl, anonKey, storage, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  // 登录 / 续期共用一个请求，结果分三类：
  //   { session }   成功
  //   { rejected }  服务端明确拒绝（4xx：密码错、refresh token 已作废 / 被复用）——会话确实失效了
  //   { transient } 暂时性失败（断网、5xx、429、2xx 但返回体残缺）——会话本身不一定有问题
  async function authRequest(grant, body) {
    let res
    try {
      res = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      return { transient: true }
    }
    if (res.status >= 500 || res.status === 429) return { transient: true }
    if (!res.ok) return { rejected: true }
    const json = await res.json().catch(() => null)
    const session = sessionFromAuth(json, now())
    return session ? { session } : { transient: true }
  }

  // 'ok' | 'rejected' | 'network'，弹窗据此分别提示「邮箱或密码不对」/「网络不通，稍后再试」
  async function login(email, password) {
    const r = await authRequest('password', { email, password })
    if (r.session) {
      await storage.set(SESSION_KEY, r.session)
      return 'ok'
    }
    return r.rejected ? 'rejected' : 'network'
  }

  // 用旧会话的 refresh token 续期，并把结果落到存储：
  //   续期成功                → 存回（Supabase 会轮换 refresh token）并返回新会话
  //   续期被明确拒绝          → 清掉存储，{ session: null }
  //   续期暂时失败（断网/5xx） → 存储原样不动，{ session: null, transient: true, stale: 旧会话 }
  async function doRefresh(s) {
    const r = await authRequest('refresh_token', { refresh_token: s.refreshToken })
    if (r.session) {
      lastRotation = { from: s.refreshToken, to: r.session }
      await storage.set(SESSION_KEY, r.session)
      return { session: r.session }
    }
    if (r.rejected) {
      await storage.remove(SESSION_KEY)
      return { session: null }
    }
    return { session: null, transient: true, stale: s }
  }

  // Supabase 会轮换 refresh token，两次并发续期拿同一个旧 token，后到的会被判复用而拒绝、
  // 把刚存好的新会话清掉——所以同一时刻只发一次续期，其余调用共用结果。
  let refreshing = null
  // 最近一次成功的轮换（旧 refresh token → 新会话），只放内存
  let lastRotation = null

  // 取可用会话，必要时续期。force=true 跳过「是否快过期」的判断，直接续期；
  // 强制续期撞上正在进行的续期时同样共用那一次。没有存过会话 → { session: null }。
  async function ensureSession(force = false) {
    let s = await storage.get(SESSION_KEY)
    // 读存储与续期完成之间的窗口：读到的是刚被轮换掉的旧会话时，直接用内存里的新会话，
    // 不再拿旧 refresh token 去续期
    if (lastRotation && s && s.refreshToken === lastRotation.from) s = lastRotation.to
    if (!s) return { session: null }
    if (!force && !needsRefresh(s, now())) return { session: s }
    if (!refreshing) refreshing = doRefresh(s).finally(() => { refreshing = null })
    return refreshing
  }

  // 续期暂时失败（断网/5xx）不算登出：会话还留着，弹窗照常进入，真正发请求时再如实报网络错误
  async function session() {
    const r = await ensureSession()
    return r.session || r.stale || null
  }

  async function logout() {
    await storage.remove(SESSION_KEY)
  }

  async function send(method, body, accessToken) {
    let res
    try {
      // 不手写 Content-Type：FormData 要由 fetch 自己带上 multipart boundary
      res = await fetchImpl(`${apiBase}${QUICK_SHOT_PATH}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      })
    } catch {
      return networkError()
    }
    // 网关返回的 413/504 是 HTML，合法 JSON 也可能是 null / 数组：保留状态码，body 恒为普通对象，
    // 交给弹窗按「上传失败」处理
    const json = await res.json().catch(() => null)
    const bodyObj = json && typeof json === 'object' && !Array.isArray(json) ? json : { data: null, error: 'bad_response' }
    return { status: res.status, body: bodyObj }
  }

  async function call(method, body) {
    const r = await ensureSession()
    if (r.transient) return networkError()
    if (!r.session) return { status: 401, body: { data: null, error: 'unauthorized' } }
    const first = await send(method, body, r.session.accessToken)
    if (first.status !== 401) return first
    // 令牌被后端拒了：本地时钟偏慢时，存的过期时刻看着还有效，这里强制续期并只重发一次
    // （FormData 可以重复发送）。续期被拒时会话已清掉，原样返回 401。
    const r2 = await ensureSession(true)
    if (r2.session) return send(method, body, r2.session.accessToken)
    if (r2.transient) return networkError()
    return first
  }

  async function todayUploads() {
    const r = await call('GET')
    return r.status === 200 && r.body && r.body.data ? r.body.data.today_uploads : null
  }

  function upload({ blob, handle, reading }) {
    const form = new FormData()
    form.set('file', blob, `${handle}.webp`)
    form.set('handle', handle)
    form.set('captured_at', String(reading.capturedAt))
    if (reading.viewer) form.set('viewer_text', reading.viewer)
    if (reading.viewerSource) form.set('viewer_source', reading.viewerSource)
    form.set('co_live', JSON.stringify(reading.coLive || []))
    return call('POST', form)
  }

  return { login, session, logout, todayUploads, upload }
}
