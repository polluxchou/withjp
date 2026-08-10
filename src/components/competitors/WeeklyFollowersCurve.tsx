// src/components/competitors/WeeklyFollowersCurve.tsx
'use client'

import { useTranslations } from 'next-intl'
import { buildWeeklyCurve, type WeeklyCurvePoint } from '@/lib/competitors/chart'
import { formatCount } from '@/lib/competitors/metrics'
import type { WeeklyPoint } from '@/lib/competitors/types'

/**
 * 折线只负责形状：坐标归一化到 0–100 后非等比铺满容器，线宽靠
 * non-scaling-stroke 恒定 2px。圆点与日期刻度改用 CSS 绝对定位（见下），
 * 因此不会被非等比缩放拉成椭圆，文字也不随 viewBox 缩放。
 */
function CurveLine({ polyline }: { polyline: string }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full text-sky-500"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export default function WeeklyFollowersCurve({ weekly, compact = false }: { weekly: WeeklyPoint[]; compact?: boolean }) {
  const t = useTranslations('competitors')
  const curve = buildWeeklyCurve(weekly.slice(-4))
  const pts = curve.points
  const latest = pts.length ? pts[pts.length - 1].followers : null
  const prev = pts.length >= 2 ? pts[pts.length - 2].followers : null
  const pct = latest != null && prev != null && prev !== 0
    ? Math.round(((latest - prev) / prev) * 1000) / 10
    : null
  const delta = pct != null ? t('weeklyDelta', { pct: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}` }) : null
  // 精确数字（非 26.9K 这样的压缩值）。显式传 locale：无参 toLocaleString 取运行时
  // 默认区域，SSR 与浏览器不一致会引发 hydration 不匹配。
  const tip = (p: WeeklyCurvePoint) =>
    t('weeklyPointTip', { date: p.week_start, count: p.followers.toLocaleString('zh-CN') })
  // 圆点不进 tab 序（每张卡 4 个空按钮会污染键盘导航），改由整图一条可读序列
  // 一次给全；精确数字另有展开区的「历史打点」表格兜底。
  const seriesLabel = `${t('weeklyFollowers')} — ${pts.map(tip).join('; ')}`

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-canvas px-2.5 py-1.5 text-xs">
        <span className="text-ink-500">{t('weeklyFollowers')}</span>
        <span className="font-medium tabular-nums text-ink-900">{formatCount(latest)}</span>
        {delta && <span className="text-sky-600">{delta}</span>}
        {curve.polyline ? (
          <span className="relative ml-auto h-5 w-24" role="img" aria-label={seriesLabel}>
            <CurveLine polyline={curve.polyline} />
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
            {curve.polyline && <CurveLine polyline={curve.polyline} />}
            {pts.map((p, i) => (
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
            ))}
            {/* 端点数值只标首尾两点（中间靠 hover），且贴容器左右边缘而非居中于
                圆点——窄列下居中会把标签推出容器被裁掉。 */}
            {pts.length > 1 && [pts[0], pts[pts.length - 1]].map((p, i) => (
              <span
                key={`edge-${p.week_start}`}
                className={`absolute text-micro font-medium tabular-nums text-ink-700 ${
                  i === 0 ? 'left-0' : 'right-0'
                } ${p.yPct < 50 ? 'translate-y-1.5' : '-translate-y-5'}`}
                style={{ top: `${p.yPct}%` }}
              >
                {formatCount(p.followers)}
              </span>
            ))}
          </div>
          <div className="relative mt-1 h-4">
            {pts.map((p) => (
              <span
                key={p.week_start}
                className="absolute -translate-x-1/2 text-micro tabular-nums text-ink-400"
                style={{ left: `${p.xPct}%` }}
              >
                {p.tick}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <span className="mt-1.5 text-micro text-ink-400">{t('weeklyEmpty')}</span>
      )}
    </div>
  )
}
