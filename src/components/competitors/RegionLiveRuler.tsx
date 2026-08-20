// src/components/competitors/RegionLiveRuler.tsx
'use client'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Tag from '@/components/ui/Tag'
import { SLOT_MIN_SESSIONS, minutesToLabel } from '@/lib/competitors/liveSlots'
import { axisTicks, buildRegionRuler } from '@/lib/competitors/regionRuler'
import type { RulerInput } from '@/lib/competitors/regionRuler'
import { timeZoneForLocale } from '@/lib/time/localeZone'
import { FOCUS_RING } from '@/lib/ui/recipes'

/** 浮层最大宽度(px)。够放下 24 小时轴与三条图例,再宽在卡片上就显得笨重。 */
const PANEL_MAX_PX = 368

/** 触发器与浮层之间的视觉间距(px)。做成浮层容器的内边距而不是外边距——
 *  外边距那 8px 不属于任何可悬停元素,鼠标从标签移向浮层必经此处,
 *  一踩上去就触发 mouseleave、浮层当场收起(实测复现)。 */
const BRIDGE_PX = 8

/** 移出后延迟收起(ms)。给「擦过边缘」「斜着穿过圆角」留余量,不要一离开就关。 */
const CLOSE_DELAY_MS = 220

/**
 * 地区标签（JP / KR）+ 悬停浮层：同地区各账号的开播时段标尺。
 *
 * 为什么做成浮层而不是常驻：它回答的是「这家在同区里算早还是算晚」——
 * 对比性问题，只在你正看着某一张卡时才有意义。
 *
 * 交互：鼠标进出、键盘聚焦、点击都能开合（只做 hover 会把键盘用户和触屏
 * 一起挡在外面），Escape 关闭。收听区域包住触发器与浮层本身，所以鼠标可以
 * 移进浮层里读而不会当场关掉。
 *
 * 一个组件不拆：拆出去就得把 next-intl 的 t 当 prop 传，那个泛型不好写。
 */
export default function RegionLiveRuler({
  region,
  peers,
  currentId,
}: {
  region: string | null
  /** 整个看板的竞品（含 related）——标尺要同区所有已收集账号。 */
  peers: RulerInput[]
  currentId: string
}) {
  const t = useTranslations('competitors')
  const locale = useLocale()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  // 打开时才取一次「现在」：纯函数不读时钟，而在渲染期读 new Date() 会让
  // SSR 与首帧不一致。浮层只在客户端交互后出现，这里取值是安全的。
  const [nowIso, setNowIso] = useState<string | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  // 浮层锚在标签左缘,窄屏上会顶穿右边界,而溢出的绝对定位元素会把整页撑出
  // 横向滚动条。开合时按触发器的位置一次算准宽度与位移。
  //
  // 两个坑:
  // ① 必须用布局视口 documentElement.clientWidth,不能用 window.innerWidth
  //    ——实测预览里两者差 58px(后者含滚动条区),按后者夹会夹不到位。
  // ② 量触发器而不是量浮层自己:量自己就得先画一帧未夹的、再修,既闪一下
  //    又容易把上一次的位移算进去。
  const [box, setBox] = useState<{ shift: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      setBox(null)
      return
    }
    const wrap = wrapRef.current
    if (!wrap) return
    const margin = 8
    const vw = document.documentElement.clientWidth
    const width = Math.min(PANEL_MAX_PX, vw - margin * 2)
    const left = wrap.getBoundingClientRect().left
    const overRight = left + width - (vw - margin)
    // 往左挪也不能把左缘挤出视口,所以位移量再夹一次。
    setBox({ shift: overRight > 0 ? -Math.min(overRight, Math.max(left - margin, 0)) : 0, width })
  }, [open])

  const ruler = useMemo(
    () =>
      nowIso
        ? buildRegionRuler({
            competitors: peers,
            region,
            timeZone: timeZoneForLocale(locale),
            now: nowIso,
            currentId,
          })
        : null,
    [peers, region, locale, nowIso, currentId],
  )

  const closeTimer = useRef<number | null>(null)
  const cancelClose = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  // 组件可能在计时器还挂着时被卸载(切换筛选/列表重取),留下的定时器没意义。
  // 注意这两个 Hook 必须在 `if (!region) return null` **之前**:放在早退之后
  // 就成了条件调用,region 由空变非空时整棵 Hook 顺序会错位。
  useEffect(() => () => cancelClose(), [])

  if (!region) return null

  const show = () => {
    cancelClose()
    setNowIso(new Date().toISOString())
    setOpen(true)
  }
  /** 延迟收起:重新进入(标签或浮层任意处)会取消这次收起。 */
  const scheduleHide = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }

  const span = ruler ? ruler.axisEnd - ruler.axisStart : 0
  const pct = (m: number) => (span ? ((m - ruler!.axisStart) / span) * 100 : 0)
  const current = ruler?.rows.find((r) => r.current)

  return (
    <span
      ref={wrapRef}
      className="relative shrink-0"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      // 焦点移到浮层内部(或标签与浮层之间来回)不算离开:只有落到 wrapper
      // 之外才收起。否则在浮层里点一下选文字就把它关了。
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleHide()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          cancelClose()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        // Tag 不吃 className，所以包一层承载焦点环与展开态。
        className={`rounded-btn ${FOCUS_RING}`}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onClick={() => (open ? (cancelClose(), setOpen(false)) : show())}
      >
        <Tag label={region} tone="violet" size="sm" />
      </button>

      {open && ruler && (
        // 外层只负责定位与那道 8px 的"桥"(内边距,不是外边距):它和触发器同属
        // 一棵子树且彼此相接,鼠标一路移进浮层不会掉出监听范围。
        // z-40 = design-system §3 的「下拉/popover」层。宽度由上面的 layout
        // effect 给准值,CSS 里的 max-w 只是它算出来之前的兜底。
        <div
          className="absolute left-0 top-full z-40 max-w-[calc(100vw-1rem)]"
          style={{
            paddingTop: BRIDGE_PX,
            width: box ? `${box.width}px` : PANEL_MAX_PX,
            transform: box?.shift ? `translateX(${box.shift}px)` : undefined,
          }}
        >
        <div
          id={panelId}
          role="tooltip"
          className="w-full rounded-card border border-line bg-surface p-3 text-left shadow-card"
        >
          <p className="text-xs font-medium text-ink-900">
            {t('rulerTitle', { region: ruler.region, days: ruler.windowDays })}
          </p>

          {ruler.rows.length === 0 ? (
            <p className="mt-1.5 text-micro text-ink-500">
              {t('rulerEmpty', { days: ruler.windowDays })}
            </p>
          ) : (
            <>
              <p className="mt-1 text-micro text-ink-500">
                {t('rulerMeta', {
                  accounts: ruler.accounts,
                  sessions: ruler.sessions,
                  zone: t('rulerZone'),
                })}
              </p>
              {current && (
                <p className="mt-1 text-micro font-medium text-primary">
                  {t('rulerCurrent', {
                    slots: current.bands.map((b) => b.centerLabel).join(' / '),
                    count: current.sessions,
                  })}
                  {current.bands.every((b) => !b.established) ? ` · ${t('rulerTentative')}` : ''}
                </p>
              )}

              {/* 刻度轴。首尾刻度改成左/右对齐，否则标签各露半截在框外。 */}
              <div className="relative mt-3 h-4">
                {axisTicks(ruler.axisStart, ruler.axisEnd).map((m) => {
                  const left = pct(m)
                  const shift =
                    left <= 0 ? 'translateX(0)' : left >= 100 ? 'translateX(-100%)' : 'translateX(-50%)'
                  return (
                    <span
                      key={m}
                      className="absolute top-0 text-micro tabular-nums text-ink-400"
                      style={{ left: `${left}%`, transform: shift }}
                    >
                      {minutesToLabel(m)}
                    </span>
                  )
                })}
              </div>

              <div className="space-y-1 border-t border-line pt-1.5">
                {ruler.rows.map((row) => (
                  <div
                    key={row.id}
                    // 强调与置信度是两个独立通道：当前账号一律给紫色底槽 + 高一档
                    // （不管它几场），置信度只由段的实心/描边表示。合成一条的话，
                    // 只播过一次的当前账号会被画成最淡的一条——恰好和「强调」相反。
                    className={`relative rounded-btn ${row.current ? 'h-3 bg-primary-soft' : 'h-2'}`}
                    // 不在图里写名字省高度：15 个账号也只占 60px。要认是谁就悬停这一条。
                    title={`${row.name} · ${t('rulerSessions', { count: row.sessions })} · ${row.bands
                      .map((b) => b.centerLabel)
                      .join(' / ')}`}
                  >
                    {row.bands.map((b) => (
                      <span
                        key={`${row.id}-${b.startMinutes}`}
                        className={`absolute inset-y-0 rounded-btn ${
                          row.current
                            ? b.established
                              ? 'bg-primary'
                              // 描边+白底压在紫色底槽上,既看得出是"推测",也仍然显眼
                              : 'border border-primary bg-surface'
                            : b.established
                              ? 'bg-ink-400'
                              : 'border border-line-strong bg-muted-soft'
                        }`}
                        style={{
                          left: `${pct(b.startMinutes)}%`,
                          width: `${pct(b.endMinutes) - pct(b.startMinutes)}%`,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-micro text-ink-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-btn bg-ink-400" />
                  {t('rulerLegendEstablished', { min: SLOT_MIN_SESSIONS })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-btn border border-line-strong bg-muted-soft" />
                  {t('rulerLegendTentative')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-btn bg-primary" />
                  {t('rulerLegendCurrent')}
                </span>
              </div>
              <p className="mt-1.5 text-micro text-ink-400">{t('rulerHint')}</p>
            </>
          )}
        </div>
        </div>
      )}
    </span>
  )
}
