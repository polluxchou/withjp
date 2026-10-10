// src/lib/competitors/liveCoverage.ts
// 「无数据」≠「没播」：哪些日子我们其实知道这个号播没播。
//
// - 有导入记录的号：LIVE History 是连续的履历，首场到末场（当地日期，两端都含）之间
//   没有场次的日子 = 确实没播。
// - 其余日子（包括只有截图的号的每一天）：只有巡检跑过的日子才算有数据。巡检日 = 全库
//   任意一个号的截图 shot_on 出现过的日期 —— 那天有人在巡检，没截到这个号才说明它没在播；
//   巡检没跑的日子，这个号播没播我们并不知道。
//
// 口径上的近似：shot_on 是按日区业务日（Asia/Tokyo）落库的，而场次的 date 是账号地区时区的
// 当地日期。JP 号两者一致；MY/TW/CN 等相差 1 小时左右，只在午夜前后那一小时会错一天，可以接受。
// 纯函数、不读时钟，可单测。
import type { LocatedSpan } from './liveStats.ts'

/** 全库截图的 shot_on → 巡检日集合（去重，丢掉空值）。 */
export function patrolDaysOf(shotDates: (string | null | undefined)[]): Set<string> {
  const days = new Set<string>()
  for (const d of shotDates) if (d) days.add(d)
  return days
}

/** patrolDaysOfBoard 只读这两个字段；看板的 CompetitorWithHistory 结构上满足它。 */
export interface PatrolBoardNode {
  shots?: readonly { shot_on: string | null }[] | null
  related?: readonly PatrolBoardNode[] | null
}

/**
 * 整个看板的巡检日：所有号（递归 related，子主播的截图也算巡检跑过）截图的 shot_on。
 * 竞品看板与开播时段页都从这里取，巡检日的来源要改（比如换成巡检日志表）只改这一处。
 */
export function patrolDaysOfBoard(competitors: readonly PatrolBoardNode[]): Set<string> {
  const dates: (string | null)[] = []
  const walk = (list: readonly PatrolBoardNode[]) => {
    for (const c of list) {
      for (const s of c.shots ?? []) dates.push(s.shot_on)
      if (c.related?.length) walk(c.related)
    }
  }
  walk(competitors)
  return patrolDaysOf(dates)
}

/**
 * 某一天对这个号来说有没有数据。
 * 截图推断的场次不撑出区间：截图只在巡检跑过的日子才有，它本身就落在巡检日里。
 */
export function coverageOf(located: LocatedSpan[], patrolDays: ReadonlySet<string>): (date: string) => boolean {
  let first: string | null = null
  let last: string | null = null
  for (const s of located) {
    if (s.source !== 'history') continue
    if (first == null || s.date < first) first = s.date
    if (last == null || s.date > last) last = s.date
  }
  return (date) => (first != null && last != null && date >= first && date <= last) || patrolDays.has(date)
}
