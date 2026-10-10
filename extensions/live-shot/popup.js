// 弹窗：登录 → 读当前页 + 截图（就绪）→ 上传（已上传 / 出错）。判断逻辑都在 lib/，这里只做编排与渲染。
import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.local.js'
import { PROBE_CONFIG, readLivePage } from './generated/page-reader.js'
import { createApi } from './lib/api.js'
import { cropRect } from './lib/crop.js'
import { bumpShots, shotsToday } from './lib/day.js'
import { handleFromLiveUrl } from './lib/liveUrl.js'
import { readingState, uploadErrorMessage } from './lib/view.js'

// Vercel 函数请求体上限 4.5MB（比后台 validateImage 的 5MB 小），编码目标留余量到 4MB
const MAX_BYTES = 4 * 1024 * 1024
const SHOT_COUNT_KEY = 'shotCount'

const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  remove: (k) => chrome.storage.local.remove(k),
}
const api = createApi({ apiBase: API_BASE, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, storage })
const $ = (id) => document.getElementById(id)

let pending = null // { handle, blob, reading, thumbUrl }
let actionHandler = null
let uploadedThisOpen = false // 已有上传响应里的新计数时，初始 GET 迟到的旧数不能盖掉它

$('action').addEventListener('click', () => actionHandler && actionHandler())

function show(view) {
  $('login').hidden = view !== 'login'
  $('main').hidden = view !== 'main'
}

function render({ name = '', line1 = '', line1Tone = '', line2 = '', line2Tone = '', thumbUrl = null, warn = false, action = null }) {
  $('name').textContent = name
  $('line1').textContent = line1
  $('line1').className = `line ${line1Tone}`
  $('line2').textContent = line2
  $('line2').className = `line ${line2Tone}`
  $('thumb').className = warn ? 'thumb warn' : 'thumb'
  $('thumb').style.backgroundImage = thumbUrl ? `url(${thumbUrl})` : ''
  const btn = $('action')
  btn.hidden = !action
  actionHandler = null
  if (action) {
    btn.textContent = action.label
    btn.className = action.primary ? 'primary' : ''
    btn.disabled = !!action.disabled
    actionHandler = action.disabled ? null : action.run
    if (action.primary && !action.disabled) btn.focus() // 回车即上传
  }
}

async function renderCounts(uploads) {
  let shots = 0
  try {
    shots = shotsToday(await storage.get(SHOT_COUNT_KEY), Date.now())
  } catch {
    // 读不到本地计数就显示 0，不让它变成未处理的异常
  }
  $('count-shots').textContent = String(shots)
  if (uploads !== undefined) $('count-uploads').textContent = uploads === null ? '—' : String(uploads)
}

function showLogin(message) {
  show('login')
  $('login-error').hidden = !message
  $('login-error').textContent = message || ''
  const target = $('email').value ? $('password') : $('email')
  target.focus()
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault()
  $('login-btn').disabled = true
  const r = await api.login($('email').value.trim(), $('password').value).catch(() => 'network')
  $('password').value = ''
  $('login-btn').disabled = false
  if (r === 'ok') return start()
  showLogin(r === 'rejected' ? '邮箱或密码不对' : '网络不通，稍后再试')
})

// 截可见区域 → 按画面矩形裁剪 → webp。返回 { blob } 或 { error: 给人看的一句话 }
async function captureCrop(tab, reading) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const r = cropRect(reading.clip.clip, reading.viewportWidth, bitmap.width, bitmap.height)
  if (!r) {
    bitmap.close()
    return { error: '请把直播画面完整滚进窗口' }
  }
  const canvas = new OffscreenCanvas(r.sw, r.sh)
  canvas.getContext('2d').drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh)
  bitmap.close()
  for (const quality of [0.92, 0.75, 0.6]) {
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
    if (blob.size <= MAX_BYTES) return { blob }
  }
  return { error: '截图过大，请缩小浏览器窗口后重试' }
}

function fail(handle, message, retry) {
  render({ name: handle ? `@${handle}` : '', line1: message, warn: true, action: { label: '重试', run: retry } })
}

async function prepare() {
  if (pending && pending.thumbUrl) URL.revokeObjectURL(pending.thumbUrl)
  pending = null
  render({ name: '读取中…' })
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const handle = tab && tab.url ? handleFromLiveUrl(tab.url) : null
  let reading = null
  if (handle) {
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readLivePage, args: [PROBE_CONFIG] })
      reading = res ? res.result : null
    } catch {
      reading = null
    }
  }
  const st = readingState(handle, reading)
  if (st.kind === 'error') return fail(handle, st.message, prepare)

  const shot = await captureCrop(tab, reading).catch(() => ({ error: '截图失败，可以重试' }))
  // 截图那一刻页面可能刚切走（SPA 切房）：再核对一次标签页网址，对不上就丢掉这张
  const after = await chrome.tabs.get(tab.id).catch(() => null)
  if (!after || handleFromLiveUrl(after.url) !== handle) return fail(handle, '页面刚切换了直播间，请重试', prepare)
  if (shot.error) return fail(handle, shot.error, prepare)

  try {
    await storage.set(SHOT_COUNT_KEY, bumpShots(await storage.get(SHOT_COUNT_KEY), Date.now()))
    await renderCounts()
  } catch {
    // 计数失败不影响就绪状态
  }
  const thumbUrl = URL.createObjectURL(shot.blob)
  pending = { handle, blob: shot.blob, reading, thumbUrl }
  render({
    name: `@${handle}`,
    line1: '✓ 截图',
    line1Tone: 'ok',
    line2: st.viewerOk ? '✓ 人数数据' : '⚠ 人数未读到',
    line2Tone: st.viewerOk ? 'ok' : 'warn',
    thumbUrl,
    action: { label: '上传', primary: true, run: upload },
  })
}

async function upload() {
  if (!pending) return
  const { handle, blob, reading, thumbUrl } = pending
  render({ name: `@${handle}`, line1: '上传中…', thumbUrl, action: { label: '上传中…', disabled: true } })
  const r = await api.upload({ blob, handle, reading }).catch(() => ({ status: 0, body: { data: null, error: 'network_error' } }))
  const data = r.body && r.body.data
  if ((r.status === 201 || r.status === 207) && data) {
    pending = null
    uploadedThisOpen = true
    renderCounts(typeof data.today_uploads === 'number' ? data.today_uploads : null)
    return render({
      name: data.competitor_name || `@${handle}`,
      line1: r.status === 201 ? '已上传' : '截图已上传，人数没写进去',
      line1Tone: r.status === 201 ? 'ok' : 'warn',
      thumbUrl,
      action: { label: '关闭', run: () => window.close() },
    })
  }
  if (r.status === 401) {
    await api.logout()
    return showLogin('登录已过期，请重新登录')
  }
  render({
    name: `@${handle}`,
    line1: uploadErrorMessage(r.body && r.body.error, handle),
    warn: true,
    thumbUrl,
    action: { label: '重试', run: upload },
  })
}

async function start() {
  const session = await api.session().catch(() => null)
  if (!session) return showLogin()
  show('main')
  renderCounts()
  api
    .todayUploads()
    .then((n) => {
      if (!uploadedThisOpen) renderCounts(n)
    })
    .catch(() => {
      if (!uploadedThisOpen) renderCounts(null)
    })
  await prepare()
}

start()
