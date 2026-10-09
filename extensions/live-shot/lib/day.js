// 「今日」= 日本时间自然日，与截图归档日期 shot_on 同一口径（后台 src/lib/competitors/quickShot.ts 的 shotOnFor）。
export function jstDay(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
}

// 本地截图计数存成 { day, shots }；读到的是别的日子 → 视为 0，跨天自然归零。
export function shotsToday(stored, nowMs) {
  return stored && stored.day === jstDay(nowMs) && Number.isInteger(stored.shots) ? stored.shots : 0
}

export function bumpShots(stored, nowMs) {
  return { day: jstDay(nowMs), shots: shotsToday(stored, nowMs) + 1 }
}
