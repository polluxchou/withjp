// 本地暂存区的规则：上限、挤掉谁、何时过期、缩略图下的时间文字。纯函数，node 测试。
// 存取在 stashDb.js（IndexedDB），这里不碰任何浏览器 API。
// 一条暂存记录：{ id, handle, blob, reading: { capturedAt, viewer, viewerSource, coLive, coLiveStatus }, partial }

export const STASH_MAX = 9
// 后台只认 24 小时内的截图时刻，超了会悄悄改用服务器时间、归错日期。
// 提前 10 分钟置灰，留给上传耗时和本机时钟偏慢。
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000 - 10 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

// JS Date 的表示范围是 ±8.64e15 毫秒；超出的有限数 new Date() 得到 Invalid Date，Intl 随即抛 RangeError。
// 截图时刻与缩略图/确认页共用这一个判断：「坏」的含义两边必须一致（坏了 = 当过期 = 显示「—」）
const validMs = (ms) => typeof ms === 'number' && Number.isFinite(ms) && Math.abs(ms) <= 8.64e15

function capturedAtOf(item) {
  const c = item && item.reading ? item.reading.capturedAt : undefined
  return validMs(c) ? c : null
}

// 从旧到新；截图时刻坏了的当作最旧（最先被挤）；同一时刻按 id 定序，结果确定
function byAge(a, b) {
  const ka = capturedAtOf(a) ?? -Infinity
  const kb = capturedAtOf(b) ?? -Infinity
  if (ka !== kb) return ka < kb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// 写入 incoming 之后超出上限的部分，最旧的在前。incoming 本身永远不挤（哪怕本机时钟被往回拨、它看着最旧）；
// 与 incoming 同 id 的旧记录会被覆盖，不算两张
export function planInsert(items, incoming) {
  const others = items.filter((it) => it.id !== incoming.id).sort(byAge)
  const over = others.length + 1 - STASH_MAX
  return over > 0 ? others.slice(0, over) : []
}

// 截图时刻坏了的一律当过期：传上去后台也只会改用服务器时间，只能删
export function isStale(item, nowMs) {
  const c = capturedAtOf(item)
  return c === null || nowMs - c >= STALE_AFTER_MS
}

export function stripOrder(items) {
  return [...items].sort(byAge).reverse()
}

function parts(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const o = {}
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value
  return { day: `${o.year}-${o.month}-${o.day}`, md: `${o.month}-${o.day}`, hm: `${o.hour}:${o.minute}` }
}

// 缩略图下的时间：与 nowMs 同一天「14:05」，前一天「昨 09:02」，其它「10-08 09:02」。
// timeZone 缺省为本机时区；时刻坏了给「—」——Intl 遇到无效日期会抛 RangeError，不能让整个弹窗白屏
export function tileTime(capturedAt, nowMs, timeZone) {
  if (!validMs(capturedAt)) return '—'
  const c = parts(capturedAt, timeZone)
  if (c.day === parts(nowMs, timeZone).day) return c.hm
  if (c.day === parts(nowMs - DAY_MS, timeZone).day) return `昨 ${c.hm}`
  return `${c.md} ${c.hm}`
}

// 确认页上的完整时刻「10-10 13:41」
export function stampTime(capturedAt, timeZone) {
  if (!validMs(capturedAt)) return '—'
  const c = parts(capturedAt, timeZone)
  return `${c.md} ${c.hm}`
}

// 满了挤掉旧图时的一行提示；没挤给空串
export function evictionNotice(evicted, nowMs, timeZone) {
  if (!evicted.length) return ''
  const oldest = [...evicted].sort(byAge)[0]
  const when = tileTime(capturedAtOf(oldest), nowMs, timeZone)
  return evicted.length === 1
    ? `最早 1 张未上传的已被挤掉（@${oldest.handle} ${when}）`
    : `最早 ${evicted.length} 张未上传的已被挤掉（最早一张 @${oldest.handle} ${when}）`
}
