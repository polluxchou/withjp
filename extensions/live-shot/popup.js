// 弹窗：登录 → 读当前页 + 截图（存进本地暂存区）→ 上传；下方暂存区可逐张放大确认后补传或删掉。
// 判断逻辑都在 lib/，这里只做编排与渲染。
import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from './config.local.js'
import { PROBE_CONFIG, readLivePage } from './generated/page-reader.js'
import { createApi } from './lib/api.js'
import { cropRect } from './lib/crop.js'
import { bumpShots, shotsToday } from './lib/day.js'
import { handleFromLiveUrl } from './lib/liveUrl.js'
import { evictionNotice, isStale, stampTime, stripOrder, tileTime } from './lib/stash.js'
import { insertStash, listStash, markPartial, removeStash } from './lib/stashDb.js'
import { coLiveLine, readingState, uploadOutcome } from './lib/view.js'

// Vercel 函数请求体上限 4.5MB（比后台 validateImage 的 5MB 小），编码目标留余量到 4MB
const MAX_BYTES = 4 * 1024 * 1024
const SHOT_COUNT_KEY = 'shotCount'
const BACK_AFTER_UPLOAD_MS = 1500
const DELETE_CONFIRM_MS = 3000

const storage = {
  get: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
  remove: (k) => chrome.storage.local.remove(k),
}
const api = createApi({ apiBase: API_BASE, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, storage })
const $ = (id) => document.getElementById(id)

// 顶部这张：{ item, state, name, message }
//   state：ready 就绪 / uploading 上传中 / uploaded 已上传 / partial 人数待补 / error 出错 / deleted 已在确认页删掉
//   item 已写进暂存区；暂存失败时只在内存里，照样能传
let current = null
let stashItems = [] // 暂存区全部记录（来自 IndexedDB）
const thumbUrls = new Map() // 记录 id → object URL
let actionHandler = null
let uploadedThisOpen = false // 已有上传响应里的新计数时，初始 GET 迟到的旧数不能盖掉它
let detailId = null
let deleteTimer = null
let backTimer = null

$('action').addEventListener('click', () => actionHandler && actionHandler())

function show(view) {
  $('login').hidden = view !== 'login'
  $('main').hidden = view !== 'main'
  $('detail').hidden = view !== 'detail'
}

function render({ name = '', line1 = '', line1Tone = '', line2 = '', line2Tone = '', line3 = '', line3Tone = '', thumbUrl = null, warn = false, action = null }) {
  $('name').textContent = name
  $('line1').textContent = line1
  $('line1').className = `line ${line1Tone}`
  $('line2').textContent = line2
  $('line2').className = `line ${line2Tone}`
  $('line3').textContent = line3
  $('line3').className = `line ${line3Tone}`
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

function showNotice(text) {
  $('notice').hidden = !text
  $('notice').textContent = text || ''
}

// ---- 缩略图地址 ----------------------------------------------------------------

function urlFor(item) {
  let u = thumbUrls.get(item.id)
  if (u === undefined) {
    try {
      u = URL.createObjectURL(item.blob)
    } catch {
      u = '' // 记录被改坏、blob 不是 Blob：不显示图，别让整个弹窗崩掉
    }
    thumbUrls.set(item.id, u)
  }
  return u
}

// 不在暂存区、不是顶部这张、也不是确认页正在看的那张，缩略图地址回收掉
// （确认页传完会停留 1.5 秒显示「已上传」，那张已移出暂存区，图不能先没了）
function recycleUrls() {
  const keep = new Set(stashItems.map((it) => it.id))
  if (current && current.state !== 'deleted') keep.add(current.item.id)
  if (detailId) keep.add(detailId)
  for (const [id, u] of thumbUrls) {
    if (keep.has(id)) continue
    if (u) URL.revokeObjectURL(u)
    thumbUrls.delete(id)
  }
}

// ---- 暂存区 ------------------------------------------------------------------

async function refreshStash() {
  try {
    stashItems = await listStash()
  } catch {
    stashItems = [] // 读不到暂存区就当它是空的：顶部这张仍可直接上传
  }
  recycleUrls()
  renderStrip()
}

function renderStrip() {
  const now = Date.now()
  const items = stripOrder(stashItems)
  $('stash').hidden = items.length === 0
  $('stash-count').textContent = String(items.length)
  $('strip').replaceChildren(...items.map((it) => tile(it, now)))
}

function tile(it, now) {
  const b = document.createElement('button')
  b.type = 'button'
  const cls = ['tile']
  if (current && current.item.id === it.id) cls.push('current')
  if (it.partial) cls.push('partial')
  if (isStale(it, now)) cls.push('stale')
  b.className = cls.join(' ')
  b.title = `@${it.handle}`
  const img = document.createElement('span')
  img.className = 'tile-img'
  const u = urlFor(it)
  if (u) img.style.backgroundImage = `url(${u})`
  const time = document.createElement('span')
  time.className = 'tile-time'
  time.textContent = tileTime(it.reading && it.reading.capturedAt, now)
  const handle = document.createElement('span')
  handle.className = 'tile-handle'
  handle.textContent = `@${it.handle}`
  b.append(img, time, handle)
  b.addEventListener('click', () => openDetail(it.id))
  return b
}

// ---- 登录 / 退出 ---------------------------------------------------------------

function resetDetail() {
  if (backTimer) clearTimeout(backTimer)
  backTimer = null
  disarmDelete()
  detailId = null
}

function showLogin(message) {
  resetDetail()
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

$('logout').addEventListener('click', async () => {
  await api.logout().catch(() => {}) // 服务端吊销是尽力而为，本地会话无论如何都会清掉
  current = null
  stashItems = [] // 只是不显示；本地暂存区不清，重新登录后还在
  recycleUrls()
  uploadedThisOpen = false
  actionHandler = null
  showLogin()
})

// ---- 截图 --------------------------------------------------------------------

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
  current = null
  showNotice('')
  render({ name: '读取中…' })
  recycleUrls()
  renderStrip()
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
  const item = {
    id: crypto.randomUUID(),
    handle,
    blob: shot.blob,
    reading: {
      capturedAt: reading.capturedAt,
      viewer: reading.viewer || null,
      viewerSource: reading.viewerSource || null,
      coLive: reading.coLive || null,
      coLiveStatus: reading.coLiveStatus || null,
    },
    partial: false,
  }
  let notice = ''
  try {
    notice = evictionNotice(await insertStash(item), Date.now())
  } catch {
    notice = '本地暂存失败，这张只能现在上传'
  }
  current = { item, state: 'ready', name: '', message: '' }
  showNotice(notice)
  await refreshStash()
  renderCurrent()
}

// ---- 顶部卡片 ------------------------------------------------------------------

function renderCurrent() {
  if (!current) return
  const { item, state } = current
  const name = current.name || `@${item.handle}`
  if (state === 'deleted') return render({ name, line1: '这张已删掉', line1Tone: 'warn', action: { label: '重新截', run: prepare } })
  const thumbUrl = urlFor(item) || null
  if (state === 'uploading') return render({ name, line1: '上传中…', thumbUrl, action: { label: '上传中…', disabled: true } })
  if (state === 'uploaded') return render({ name, line1: '已上传', line1Tone: 'ok', thumbUrl, action: { label: '关闭', run: () => window.close() } })
  if (state === 'partial') {
    return render({ name, line1: '截图已上传，人数没写进去', line1Tone: 'warn', thumbUrl, action: { label: '补写人数', primary: true, run: uploadCurrent } })
  }
  if (state === 'error') return render({ name, line1: current.message, warn: true, thumbUrl, action: { label: '重试', run: uploadCurrent } })
  const co = coLiveLine(item.reading.coLiveStatus, item.reading.coLive)
  render({
    name,
    line1: '✓ 截图',
    line1Tone: 'ok',
    line2: item.reading.viewer ? '✓ 人数数据' : '⚠ 人数未读到',
    line2Tone: item.reading.viewer ? 'ok' : 'warn',
    line3: co.text,
    line3Tone: co.tone,
    thumbUrl,
    action: { label: '上传', primary: true, run: uploadCurrent },
  })
}

// 上传一条记录，按结果处理暂存区与底部计数，返回 uploadOutcome 的结果
async function sendItem(item) {
  // try/await 而不是 .catch：暂存记录被改坏（blob 不是 Blob）时 upload 会在拼表单那一步同步抛错，.catch 接不住
  let r
  try {
    r = await api.upload(item)
  } catch {
    r = { status: 0, body: { data: null, error: 'network_error' } }
  }
  const out = uploadOutcome(r, item.handle)
  if ('todayUploads' in out) {
    uploadedThisOpen = true
    renderCounts(out.todayUploads)
  }
  if (out.kind === 'login') {
    await api.logout().catch(() => {})
    return out
  }
  try {
    if (out.stash === 'remove') await removeStash(item.id)
    else if (out.stash === 'partial') await markPartial(item.id)
  } catch {
    // 暂存区没跟上：图还在，再传一次后台按截图时刻认出是同一张，不会多出一张
  }
  await refreshStash()
  return out
}

// 上传的恰好是顶部这张时，顶部卡片跟着变
function applyToCurrent(id, out) {
  if (!current || current.item.id !== id) return
  current.name = out.name || ''
  current.message = out.message || ''
  current.state = out.kind === 'ok' ? 'uploaded' : out.kind === 'partial' ? 'partial' : 'error'
  renderCurrent()
}

async function uploadCurrent() {
  const cur = current
  if (!cur || cur.state === 'uploading') return
  cur.state = 'uploading'
  renderCurrent()
  const out = await sendItem(cur.item)
  if (out.kind === 'login') return showLogin('登录已过期，请重新登录')
  applyToCurrent(cur.item.id, out)
}

// ---- 放大确认页 ----------------------------------------------------------------

function openDetail(id) {
  const it = stashItems.find((x) => x.id === id)
  if (!it) return
  resetDetail()
  detailId = id
  show('detail')
  renderDetail(it)
}

// status：{ text, tone } 覆盖默认的状态行；actionLabel 覆盖上传按钮文字
function renderDetail(it, status = null, actionLabel = null) {
  const rd = it.reading || {}
  const stale = isStale(it, Date.now())
  const u = urlFor(it)
  $('detail-img').style.backgroundImage = u ? `url(${u})` : ''
  $('detail-img').className = stale ? 'big stale' : 'big'
  $('detail-name').textContent = `@${it.handle} · ${stampTime(rd.capturedAt)}`
  $('detail-viewer').textContent = rd.viewer ? `人数 ${rd.viewer}` : '⚠ 人数未读到'
  $('detail-viewer').className = rd.viewer ? 'line' : 'line warn'
  const co = coLiveLine(rd.coLiveStatus, rd.coLive)
  $('detail-colive').textContent = co.text
  $('detail-colive').className = `line ${co.tone}`
  const st = status || (stale ? { text: '已过期，请重新截', tone: '' } : it.partial ? { text: '截图已上传，人数没写进去', tone: 'warn' } : null)
  $('detail-status').hidden = !st
  $('detail-status').textContent = st ? st.text : ''
  $('detail-status').className = st ? `line ${st.tone}` : 'line'
  const up = $('detail-upload')
  up.hidden = stale
  up.disabled = false
  up.textContent = actionLabel || (it.partial ? '补写人数' : '上传')
  $('detail-delete').disabled = false
  $('detail-back').disabled = false
  disarmDelete()
  if (!stale) up.focus()
}

function setDetailBusy(text) {
  for (const id of ['detail-upload', 'detail-delete', 'detail-back']) $(id).disabled = true
  $('detail-status').hidden = false
  $('detail-status').textContent = text
  $('detail-status').className = 'line'
}

// 确认页看着的这张已不在暂存区（顶部卡片传掉了、被新截图挤掉了、或在另一个窗口处理掉了）
function showGone() {
  $('detail-status').hidden = false
  $('detail-status').textContent = '这张已不在暂存区（已上传或被挤掉）'
  $('detail-status').className = 'line'
  $('detail-upload').hidden = true
  $('detail-delete').disabled = false
  $('detail-back').disabled = false
}

function backToMain() {
  resetDetail()
  show('main')
  const act = $('action')
  if (!act.hidden && !act.disabled) act.focus() // 回到主界面后恢复回车即上传
}

function disarmDelete() {
  if (deleteTimer) clearTimeout(deleteTimer)
  deleteTimer = null
  $('detail-delete').textContent = '删掉'
}

$('detail-back').addEventListener('click', backToMain)

$('detail-upload').addEventListener('click', async () => {
  const it = stashItems.find((x) => x.id === detailId)
  if (!it) return showGone()
  if (isStale(it, Date.now())) return
  // 顶部卡片正在传同一张：别重复发，也别静默无反应
  if (current && current.item.id === it.id && current.state === 'uploading') {
    $('detail-status').hidden = false
    $('detail-status').textContent = '顶部正在上传这张'
    $('detail-status').className = 'line'
    return
  }
  setDetailBusy('上传中…')
  const out = await sendItem(it)
  if (out.kind === 'login') return showLogin('登录已过期，请重新登录')
  applyToCurrent(it.id, out)
  if (detailId !== it.id) return
  if (out.kind === 'ok') {
    $('detail-status').textContent = '已上传'
    $('detail-status').className = 'line ok'
    $('detail-back').disabled = false
    backTimer = setTimeout(backToMain, BACK_AFTER_UPLOAD_MS)
    return
  }
  const fresh = stashItems.find((x) => x.id === it.id) || { ...it, partial: it.partial || out.kind === 'partial' }
  if (out.kind === 'partial') return renderDetail(fresh, { text: '截图已上传，人数没写进去', tone: 'warn' }, '补写人数')
  renderDetail(fresh, { text: out.message, tone: 'warn' }, '重试')
})

// 删掉要点两次：暂存图还没上传，直播结束后就补不回来了
$('detail-delete').addEventListener('click', async () => {
  if (!deleteTimer) {
    $('detail-delete').textContent = '确认删掉'
    deleteTimer = setTimeout(disarmDelete, DELETE_CONFIRM_MS)
    return
  }
  disarmDelete()
  const id = detailId
  try {
    await removeStash(id)
  } catch {
    const it = stashItems.find((x) => x.id === id)
    if (it) renderDetail(it, { text: '删除失败，可以重试', tone: 'warn' })
    return
  }
  if (current && current.item.id === id && current.state !== 'uploaded') {
    current.state = 'deleted'
    renderCurrent()
  }
  await refreshStash()
  backToMain()
})

// ---- 启动 --------------------------------------------------------------------

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
  await refreshStash()
  await prepare()
}

start()
