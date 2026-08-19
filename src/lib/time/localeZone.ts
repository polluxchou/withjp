// src/lib/time/localeZone.ts
// 界面语言 → 展示时区。
//
// 库里所有时刻都是 timestamptz（UTC 打点），"当地时间是几点"完全是展示层的事。
// 展示时区跟着**界面语言**走，而不是跟着浏览器/服务器所在时区：三边团队分处
// 日本、国内、北美，同一张截图截下来发到群里，同语言的人读到的必须是同一个数字；
// 若跟设备时区走，同一条记录在两个人屏幕上会显示成不同时刻，没法对照。
//
// 注意与"日期分桶"区分：competitor_shots.shot_on 这类归档用的日期列必须全站唯一
// （按日区业务日 Asia/Tokyo 落库，见 scripts/live-watch/record-live-shot.mjs），
// 不能随界面语言变——那是数据，不是显示。
// 相对路径 + .ts 后缀：node --test 不认 tsconfig 的 @/ 别名（站内 src/lib/site/* 同款写法）
import { defaultLocale, isLocale, type Locale } from '../../i18n/routing.ts'

export const LOCALE_TIME_ZONE: Record<Locale, string> = {
  zh: 'Asia/Shanghai', // 北京 UTC+8（无夏令时）
  ja: 'Asia/Tokyo', // 日本 UTC+9（无夏令时）
  en: 'America/Los_Angeles', // 北美加州 PST/PDT（有夏令时，交给 IANA 库自己算）
}

/** 未知/缺失 locale 回落到默认语言的时区，绝不回落到运行环境时区。 */
export function timeZoneForLocale(locale: string | undefined): string {
  return LOCALE_TIME_ZONE[isLocale(locale) ? locale : defaultLocale]
}

/**
 * UTC 时刻 → 指定语言时区的「MM-DD HH:mm」（24 小时制）。
 *
 * 版式固定成数字序，不用各语言的本地排法：en-US 会给出 "8/18/2026, 9:32 PM"，
 * 在灯箱那条一行 meta 里既长又和站内其它日期（一律 YYYY-MM-DD）不同构。
 * 随语言变的只有"换算到哪个区"这一件事。
 *
 * 时刻非法或缺失返回 null（调用方据此整段不渲染）。
 */
export function formatDayTimeInLocaleZone(iso: string | null | undefined, locale: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneForLocale(locale),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // 不用 hour12:false —— 那在部分实现里会把 0 点渲染成 24
  }).formatToParts(d)
  const at = (type: string) => parts.find((p) => p.type === type)?.value
  const [mm, dd, hh, mi] = [at('month'), at('day'), at('hour'), at('minute')]
  if (!mm || !dd || !hh || !mi) return null
  return `${mm}-${dd} ${hh}:${mi}`
}
