// 扩展与后台 / Supabase 的全部网络交互。fetch 与存储都可注入，便于 node 测试。
// 会话只存令牌（chrome.storage.local），密码只在 login() 的这一次请求里出现。
// 网络异常一律不向外抛：会话类返回 null，接口类返回 { status: 0, body: { error: 'network_error' } }，
// 弹窗据此显示一句话，不会卡在「读取中」。
import { needsRefresh, sessionFromAuth } from './session.js'

const SESSION_KEY = 'session'
const QUICK_SHOT_PATH = '/api/competitors/quick-shot'

export function createApi({ apiBase, supabaseUrl, anonKey, storage, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  async function authRequest(grant, body) {
    try {
      const res = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      return res.ok ? sessionFromAuth(json, now()) : null
    } catch {
      return null
    }
  }

  async function login(email, password) {
    const s = await authRequest('password', { email, password })
    if (s) await storage.set(SESSION_KEY, s)
    return !!s
  }

  async function session() {
    const s = await storage.get(SESSION_KEY)
    if (!s) return null
    if (!needsRefresh(s, now())) return s
    const fresh = await authRequest('refresh_token', { refresh_token: s.refreshToken })
    if (!fresh) {
      await storage.remove(SESSION_KEY)
      return null
    }
    await storage.set(SESSION_KEY, fresh)
    return fresh
  }

  async function logout() {
    await storage.remove(SESSION_KEY)
  }

  async function call(method, body) {
    const s = await session()
    if (!s) return { status: 401, body: { data: null, error: 'unauthorized' } }
    let res
    try {
      res = await fetchImpl(`${apiBase}${QUICK_SHOT_PATH}`, {
        method,
        headers: { Authorization: `Bearer ${s.accessToken}` },
        body,
      })
    } catch {
      return { status: 0, body: { data: null, error: 'network_error' } }
    }
    // 网关返回的 413/504 是 HTML，不是 JSON：保留状态码，交给弹窗按「上传失败」处理
    const json = await res.json().catch(() => ({ data: null, error: 'bad_response' }))
    return { status: res.status, body: json }
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
