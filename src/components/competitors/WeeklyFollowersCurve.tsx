// src/components/competitors/WeeklyFollowersCurve.tsx
'use client'

import { useTranslations } from 'next-intl'
import { buildWeeklyCurve, type WeeklyCurvePoint } from '@/lib/competitors/chart'
import { formatCount } from '@/lib/competitors/metrics'
import type { WeeklyPoint } from '@/lib/competitors/types'
import { fillWeekSlots } from '@/lib/competitors/weekly'

/**
 * 曲线画多少个日历周。改这个数**必须同步改** i18n 的 weeklyFollowers 文案
 * （zh/en/ja 三处的「近N周」），否则标题和图上画的周数会对不上。
 * 也要重新量窄宽度：刻度行是 N 等分格，N 越大每格越窄（见下方 grid 注释）。
 */
const WEEKS = 5

/**
 * 折线只负责形状：坐标归一化到 0–100 后非等比铺满容器，线宽靠
 * non-scaling-stroke 恒定 2px。圆点与日期刻度改用 CSS 绝对定位（见下），
 * 因此不会被非等比缩放拉成椭圆，文字也不随 viewBox 缩放。
 *
 * 缺采的周会把折线断开，所以这里画的是 segments 数组而不是单条 polyline——
 * 一条横跨空档的直线会把「两周的变化」画成「一周的变化」。
 */
function CurveLine({ segments }: { segments: string[] }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full text-sky-500"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {segments.map((points) => (
        <polyline
          key={points}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

export default function WeeklyFollowersCurve({ weekly, compact = false }: { weekly: WeeklyPoint[]; compact?: boolean }) {
  const t = useTranslations('competitors')
  // fillWeekSlots 而非 slice(-WEEKS)：后者取「最近 N 个**有数据**的周」，漏采一周后
  // 剩下的点仍被等距铺满，图上看不出缺口。
  // 非 compact 才用 'cell'：刻度行是等分 grid，圆点必须落在同一批格心上才逐列对齐。
  // compact 是 96×20px 稀疏图，没有圆点也没有刻度行，继续走内缩口径。
  const curve = buildWeeklyCurve(fillWeekSlots(weekly, WEEKS), compact ? {} : { align: 'cell' })
  const pts = curve.points
  // 右端由 fillWeekSlots 锚在最新有数据的周，所以末位必非空；仍做兜底。
  const latest = pts.length ? pts[pts.length - 1].followers : null
  // prev 取**紧邻的上一个槽位**，不是「上一个有数据的点」：跨着空档算出来的百分比
  // 不是「每周」的变化，文案却写着 /周，会误导。上一周缺采就不显示环比。
  const prev = pts.length >= 2 ? pts[pts.length - 2].followers : null
  const pct = latest != null && prev != null && prev !== 0
    ? Math.round(((latest - prev) / prev) * 1000) / 10
    : null
  const delta = pct != null ? t('weeklyDelta', { pct: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}` }) : null
  // 精确数字（非 26.9K 这样的压缩值）。显式传 locale：无参 toLocaleString 取运行时
  // 默认区域，SSR 与浏览器不一致会引发 hydration 不匹配。
  // 缺采的周复用同一条文案、数值位给 formatCount(null) 的「—」，不新增 i18n key。
  const tip = (p: WeeklyCurvePoint) =>
    t('weeklyPointTip', {
      date: p.week_start,
      count: p.followers == null ? formatCount(null) : p.followers.toLocaleString('zh-CN'),
    })
  // 圆点不进 tab 序（每张卡 4 个空按钮会污染键盘导航），改由整图一条可读序列
  // 一次给全；精确数字另有展开区的「历史打点」表格兜底。
  const seriesLabel = `${t('weeklyFollowers')} — ${pts.map(tip).join('; ')}`

  if (compact) {
    // self-start:grid 项默认 stretch,否则 32px 的小条会被拉到和相册齐高。
    // min-w-0 + truncate + shrink-0:让它在窄格里收缩而不是撑破轨道(见 Step 1)。
    return (
      <div className="flex min-w-0 items-center gap-2 self-start overflow-hidden rounded-md bg-canvas px-2.5 py-1.5 text-xs">
        <span className="truncate text-ink-500">{t('weeklyFollowers')}</span>
        <span className="font-medium tabular-nums text-ink-900">{formatCount(latest)}</span>
        {delta && <span className="whitespace-nowrap text-sky-600">{delta}</span>}
        {curve.segments.length ? (
          <span className="relative ml-auto h-5 w-24 shrink-0" role="img" aria-label={seriesLabel}>
            <CurveLine segments={curve.segments} />
          </span>
        ) : pts.length === 0 ? (
          // 只有真的无数据才提示；单点画不出线，但左侧已有数值，再说「暂无」会自相矛盾
          <span className="ml-auto text-micro text-ink-400">{t('weeklyEmpty')}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col self-start rounded-md bg-canvas p-2.5">
      <span className="text-micro text-ink-500">{t('weeklyFollowers')}</span>
      <span className="text-lg font-semibold leading-tight tabular-nums text-ink-900">{formatCount(latest)}</span>
      {delta && <span className="text-micro text-sky-600">{delta}</span>}
      {pts.length ? (
        <div className="mt-2" role="img" aria-label={seriesLabel}>
          <div className="relative h-16">
            {curve.segments.length > 0 && <CurveLine segments={curve.segments} />}
            {/* 缺采的周只占格子、不画圆点，也就没有 hover 提示——空档本身就是信息。 */}
            {pts.map((p, i) =>
              p.yPct == null ? null : (
                <span
                  key={p.week_start}
                  className="group absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center hover:z-20"
                  style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
                >
                  <span className="h-2 w-2 rounded-full bg-sky-500 ring-2 ring-canvas" />
                  {/* 提示框比这一列还宽，所以左半边的点朝右展开、右半边朝左展开，
                      避免在窄列下溢出到视口外；同时限宽换行而非一行拉长。 */}
                  <span
                    className={`pointer-events-none absolute hidden w-max max-w-[9rem] rounded-field bg-ink-900 px-1.5 py-1 text-micro tabular-nums text-white group-hover:block ${
                      p.yPct < 50 ? 'top-full mt-0.5' : 'bottom-full mb-0.5'
                    } ${i < pts.length / 2 ? 'left-0' : 'right-0'}`}
                  >
                    {tip(p)}
                  </span>
                </span>
              ),
            )}
          </div>
          {/* 日期与数值同列的等分 grid：相邻标签不可能重叠（最坏只是单格 truncate），
              比 absolute left:x% 居中稳——后者在窄列（卡片 1/4 宽）下会互相压。
              列数是运行时值，只能走 style：动态拼 grid-cols-[...] 类名 Tailwind
              扫不到、会静默失效。精确值仍由圆点的 hover 提示给出。
              缺采的周由 formatCount(null) 渲染成「—」，与空白格区分开。 */}
          <div
            className="mt-1 grid"
            style={{ gridTemplateColumns: `repeat(${pts.length}, minmax(0, 1fr))` }}
          >
            {pts.map((p) => (
              <div key={p.week_start} className="min-w-0 text-center">
                <div className="text-micro tabular-nums text-ink-400">{p.tick}</div>
                <div
                  className={`truncate text-micro font-medium tabular-nums ${
                    p.followers == null ? 'text-ink-400' : 'text-ink-700'
                  }`}
                >
                  {formatCount(p.followers)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <span className="mt-1.5 text-micro text-ink-400">{t('weeklyEmpty')}</span>
      )}
    </div>
  )
}
