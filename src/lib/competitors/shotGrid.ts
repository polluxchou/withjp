// src/lib/competitors/shotGrid.ts
// 纯函数：把竞品截图按日期归并成一条整页共用的日期轴与窗口。
import type { CompetitorShot } from './types.ts'

/** 无日期图片在日期轴上的占位键。 */
export const UNDATED_KEY = '—'

/** 日期窗口列数：一屏横向对比 5 天。三处渲染必须用同一个值,否则列对不齐。 */
export const SHOT_WINDOW_SIZE = 5

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 截图日期最多能往后选几天。
 *
 * 允许未来日期不是笔误：团队分布在不同时区，而 shot_on 记的是**直播当地**那一天。
 * 加州的人（UTC-7）看到的"今天"比日本晚一天，日本 09-14 凌晨那场直播，他要归档时
 * 本地时钟还停在 09-13 —— 只开放到"今天"的话，这一天他根本选不到。
 *
 * 仍然留一个上限而不是完全放开：再往后就不是时区差了，而是手滑，
 * 一个 2027 年的日期会在日期轴上拉出一列没人能解释的孤儿。
 */
export const SHOT_DATE_FUTURE_DAYS = 3

/**
 * 在 YYYY-MM-DD 上加减天数，跨月跨年跨闰年都按日历天走。
 *
 * 走 Date.UTC 而不是本地时区的 Date：本地时区在夏令时切换那天只有 23 或 25 小时，
 * 用 `d.setDate(d.getDate() + n)` 那一套在边界上会算出前一天（美西 3 月 8 日、
 * 11 月 1 日各一次，团队里有人在加州）。当成 UTC 上的纯日历日就没有这个坑。
 *
 * 认不出的输入原样返回：产出 "NaN-NaN-NaN" 会被塞进 input 的 max，
 * 让整个日期控件静默失效 —— 那种失效在界面上没有任何痕迹。
 */
export function shiftDate(ymd: string, days: number): string {
  const t = Date.parse(ymd + 'T00:00:00Z')
  if (Number.isNaN(t)) return ymd
  // 回读比对一次就够：能原样回读的输入，必然是规范写法的 YYYY-MM-DD 且是真实日历日。
  // 这一句同时挡掉了 2026-02-30(被 Date 自动进位)、2026-9-13(非规范写法)、
  // 空串与乱码 —— 再在前面加一道正则守卫是死代码,突变探针证实过没有任何测试能杀它。
  if (new Date(t).toISOString().slice(0, 10) !== ymd) return ymd
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * shot_on 是否合法：null / undefined 或真实存在的 YYYY-MM-DD 日历日。
 *
 * 这是**写入前的入参守卫**，不是通用的格式判定：null 表示"显式清空日期"、
 * undefined 表示"本次不改这个字段"，两者都必须放行，所以 null 合法而空串不合法。
 * 别拿它去校验文本框输入。
 *
 * 用 toISOString 回读比对，挡掉 2026-02-30 这类会被 Date 自动进位的假日期；
 * 年份另外卡范围，否则 0020-08-10 这种手滑值会在日期轴上拉出一列两千年前的孤儿。
 */
export function isValidShotDate(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false
  if (!DATE_RE.test(value)) return false
  const year = Number(value.slice(0, 4))
  if (year < 1900 || year > 2999) return false
  const d = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === value
}

/**
 * 以 anchorIndex 为中心取 size 列，夹逼到 [0, axis.length)。
 * 靠边时向另一侧补足，仍尽量取满 size 列，保证每个竞品行的列数一致。
 * anchorIndex 为 -1（anchor 不在轴上）时按贴右处理，即取轴末尾 size 列。
 */
export function windowOf(axis: string[], anchorIndex: number, size: number): string[] {
  if (!axis.length || size <= 0) return []
  if (size >= axis.length) return axis.slice()
  const anchor = anchorIndex < 0 ? axis.length - 1 : Math.min(anchorIndex, axis.length - 1)
  let start = anchor - Math.floor((size - 1) / 2)
  if (start < 0) start = 0
  if (start + size > axis.length) start = axis.length - size
  return axis.slice(start, start + size)
}

/**
 * 把用户选中的 anchor 归一化到轴上的一个真实日期。
 * 命中则原样返回；未命中（轴重算后该天消失、或初始为 null）取日历距离最近的一天，
 * 距离并列时取较新的一天。UNDATED_KEY 不参与距离计算。轴为空返回 null。
 */
export function resolveAnchor(axis: string[], anchor: string | null): string | null {
  if (!axis.length) return null
  if (anchor && axis.includes(anchor)) return anchor
  // 注意：UNDATED_KEY 被追加在轴尾（见 shotWindow.ts 的 buildShotIndex），所以"最新一天"必须从
  // 过滤掉占位键的 dated 里取，不能直接拿 axis 的末位。
  const dated = axis.filter((d) => d !== UNDATED_KEY)
  const newest = dated.length ? dated[dated.length - 1] : axis[axis.length - 1]
  if (!anchor || anchor === UNDATED_KEY) return newest
  if (!dated.length) return newest
  const target = Date.parse(anchor + 'T00:00:00Z')
  if (Number.isNaN(target)) return dated[dated.length - 1]
  let best = dated[0]
  let bestDist = Infinity
  for (const d of dated) {
    const dist = Math.abs(Date.parse(d + 'T00:00:00Z') - target)
    if (dist < bestDist || (dist === bestDist && d > best)) {
      best = d
      bestDist = dist
    }
  }
  return best
}

/**
 * 看板里单个账号截图的排列：有日期的按 shot_on 倒序、同日按 sort_order 升序，无日期的垫底。
 * assembleBoard 与 mergeShotRange 共用——补取合并后的顺序才和首屏一致。
 */
export function compareShotsForBoard(
  a: Pick<CompetitorShot, 'shot_on' | 'sort_order'>,
  b: Pick<CompetitorShot, 'shot_on' | 'sort_order'>,
): number {
  if (a.shot_on == null && b.shot_on == null) return a.sort_order - b.sort_order
  if (a.shot_on == null) return 1
  if (b.shot_on == null) return -1
  const cmp = b.shot_on.localeCompare(a.shot_on)
  return cmp !== 0 ? cmp : a.sort_order - b.sort_order
}

/** 截图时刻（毫秒）：采集脚本/插件写的 captured_at 优先，人工上传没有它，退回入库时刻。读不出为 NaN。 */
function shotMoment(s: Pick<CompetitorShot, 'captured_at' | 'created_at'>): number {
  return Date.parse(s.captured_at ?? s.created_at)
}

/**
 * 按日期归组；shot_on 为空归入 UNDATED_KEY。
 * 组内按时间正序：sort_order → 截图时刻 → id 兜底。末张是当天最新的一张，即封面（见 coverOf）。
 * 时刻按数值比而不是字符串：时间戳写法不统一（Z / +00:00 混用、小数秒位数不定），字符串比较会排错。
 * NaN 相减仍是 NaN，被 || 当成"相等"，落到 id 兜底。
 */
export function groupShotsByDate(shots: CompetitorShot[]): Map<string, CompetitorShot[]> {
  const map = new Map<string, CompetitorShot[]>()
  for (const s of shots ?? []) {
    const key = s.shot_on || UNDATED_KEY
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }
  for (const arr of Array.from(map.values())) {
    arr.sort((a, b) => (a.sort_order - b.sort_order) || (shotMoment(a) - shotMoment(b)) || a.id.localeCompare(b.id))
  }
  return map
}

/**
 * 当天封面：组内（groupShotsByDate 的时间正序）最后一张，即最新截的那张——插件刚截的图会立刻
 * 成为封面，相当于上传成功的回执。灯箱也从这张打开（往左是更早的），胶片条与下载序号仍按时间正序。
 */
export function coverOf<T>(dayShots: T[]): T | undefined {
  return dayShots[dayShots.length - 1]
}

/**
 * 该账号在轴上当前这一天有没有留下截图 —— 导航条据此把它标成「待补」。
 *
 * 判据是「有没有那天的图」，不是「那天有没有开播」：我们只有截图这一手证据，
 * 对方那天究竟没播还是播了没截到，库里区分不出来（半自动采集，见
 * docs/superpowers/specs 里的直播截图评审）。所以文案说的是「无截图」而非「未开播」。
 *
 * date 为 null（轴为空）或 UNDATED_KEY（当前停在"未标日期"那一列）时一律不标记：
 * 那两种情况下"当天"没有意义，标出来只会让整条导航一片黄。
 */
export function missesShotOn(
  shots: { shot_on: string | null }[] | undefined,
  date: string | null,
): boolean {
  if (!date || date === UNDATED_KEY) return false
  return !(shots ?? []).some((s) => s.shot_on === date)
}
