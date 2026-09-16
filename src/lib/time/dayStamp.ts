// src/lib/time/dayStamp.ts — 「日期列」的渲染。
//
// 战略节点的 start_date / target_date / completed_date 存的是**哪一天**,不是
// 某个时刻:表单写的是 `YYYY-MM-DDT00:00:00.000Z`,服务端补的完成日期是东京
// 业务日的 UTC 日戳。把这种值丢给 date-fns 的 format() 会按**浏览器本地时区**
// 换算,UTC 以西的人于是整整差一天 —— 存的 8/31 在 PDT(UTC-7) 上显示成 8/30。
// 团队分处日本、国内、北美(见 localeZone.ts),北美那边看到的每一个日期都错位。
//
// 解法是把 UTC 的年月日原样搬到一个本地 Date 上再格式化:日历字段不变,时区
// 换算被绕开。这与 localeZone.ts 处理的是两类不同的值 —— 那里是「时刻」,要
// 按界面语言换算到对应时区;这里是「日期」,压根不该换算。
//
// 相对路径 + .ts 后缀:node --test 不认 tsconfig 的 @/ 别名。
import { format } from 'date-fns/format'

/** UTC 日戳 → 'MMM d, yyyy' 之类的日历格式,不做任何时区换算。 */
export function formatDayStamp(iso: string | null | undefined, pattern = 'MMM d, yyyy'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), pattern)
}
