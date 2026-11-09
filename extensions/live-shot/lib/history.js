// 「读开播记录」：直播间顶部主播头像弹窗里的 History 列表 → 后台 /api/competitors/quick-history。
// 2026-11 TikTok 把这个弹窗换成 tux-modal 组件，里面全部元素 user-select:none，人工全选复制失效；
// 文字仍在 DOM innerText 里，插件直接读。解析放后台（与「粘贴导入」同一套），插件只交原文。

// 注入到页面里跑（chrome.scripting.executeScript 的 func）：必须自包含，不能引用本文件别的东西。
// doc / wait 只给测试注入用，页面里走默认值。
// 返回 { text, timeZone, opened } 或 { error: 'no_avatar' | 'no_modal' | 'no_history' }
export async function readHistoryModal(doc = document, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const lines = (el) => String(el.innerText || '').split('\n').map((s) => s.trim())
  // 弹窗容器的 class 带哈希后缀（tux-modal__container-PDEFYU），按前缀找；认的是里面有一行恰为 History
  const findModal = () =>
    Array.from(doc.querySelectorAll('[class*="tux-modal__container"]')).find((el) => lines(el).includes('History')) || null
  let modal = findModal()
  let opened = false
  if (!modal) {
    const avatar = doc.querySelector('[data-e2e="room-header-anchor-avatar"]')
    if (!avatar) return { error: 'no_avatar' }
    avatar.click()
    opened = true
    for (let i = 0; i < 20 && !modal; i++) {
      await wait(300)
      modal = findModal()
    }
    if (!modal) return { error: 'no_modal' }
  }
  // 列表在弹窗里是一次性整份渲染的（实测最多约 100 场 / 90 天），但刚打开时可能还在填：
  // 等到行数连续两次不变再读
  let all = lines(modal)
  for (let i = 0; i < 10; i++) {
    await wait(300)
    const next = lines(modal)
    if (next.length === all.length) break
    all = next
  }
  // History 之前是粉丝团、礼物墙等，与开播记录无关，不交给后台
  const at = all.indexOf('History')
  const text = all.slice(at).filter((s) => s !== '').join('\n')
  if (text === 'History') return { error: 'no_history' }
  return { text, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, opened }
}

export function readErrorMessage(code) {
  switch (code) {
    case 'no_avatar':
      return '没找到主播头像，确认是在直播间页面'
    case 'no_modal':
      return '头像弹窗没打开，手动点一下头像再试'
    case 'no_history':
      return '弹窗里没有开播记录'
    default:
      return '读取失败，可以重试'
  }
}

const md = (ymd) => (typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}` : '?')

// 后台响应 → { kind: 'ok' | 'login' | 'error', lines: [{ text, tone }] }
export function historyOutcome(r, handle) {
  const status = r ? r.status : 0
  const body = r && r.body && typeof r.body === 'object' ? r.body : null
  const data = body && body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : null
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  if (status === 200 && data) {
    const out = [
      { text: `✓ 读到 ${n(data.parsed)} 场 · ${md(data.first_date)} → ${md(data.last_date)}`, tone: 'ok' },
      { text: `新增 ${n(data.inserted)} · 已有 ${n(data.updated)}`, tone: '' },
    ]
    if (n(data.skipped) > 0) out.push({ text: `${n(data.skipped)} 场是别人导入的，没改`, tone: 'warn' })
    return { kind: 'ok', lines: out }
  }
  if (status === 401) return { kind: 'login', lines: [] }
  const code = body && body.error
  let text
  switch (code) {
    case 'not_in_library':
      text = `@${handle} 不在竞品库`
      break
    case 'no_sessions':
      text = '没认出开播记录（TikTok 界面需为英文）'
      break
    case 'forbidden':
      text = '这个帐号没有竞品监测权限'
      break
    case 'network_error':
      text = '网络不通，可以重试'
      break
    case 'auth_unavailable':
      text = '登录服务暂时不可用，可以重试'
      break
    default:
      text = '导入失败，可以重试'
  }
  return { kind: 'error', lines: [{ text, tone: 'warn' }] }
}
