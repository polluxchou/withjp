// src/components/competitors/ShotLightbox.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Loader2, Pencil, Trash2, X } from 'lucide-react'
import type { CompetitorShot } from '@/lib/competitors/types'
import { shotUptimeParts } from '@/lib/competitors/types'
import { todayLocal } from '@/lib/competitors/localDate'
import { LIGHTBOX_VISIBLE, clampWindowStart, visibleCountFor } from '@/lib/competitors/shotGrid'
import { shotDockSections } from '@/lib/competitors/shotDock'
import { formatDayTimeInLocaleZone } from '@/lib/time/localeZone'
import { lockViewportScroll } from '@/lib/ui/scrollLock'

/**
 * 版式分三层，三层之间互不影响位置：
 *
 *   A 固定 chrome —— 左上计数、右上关闭，absolute 定位到遮罩四角，不进 flex 流。
 *   B 舞台        —— flex-1，图片在剩余空间里居中。
 *   C 底部条      —— 贴底，装 caption / 直播态 / 编辑区。
 *
 * 为什么非得这么分：改版前这三样挤在同一行 `flex items-center gap-3` 里，
 * 而那一行没有 flex-wrap。实测 375×812 下这一行的 max-content 宽度是
 * 自动采集态 722px、人工上传态 425px，可用宽只有 327px —— 关闭键左边缘落在
 * x=432，整个在屏幕外，手机上根本点不到（只能靠点遮罩关）。同时因为整行居中，
 * 两态之间 297px 的宽度差会让关闭键左右各漂 ~148px：翻一张图按钮就换地方。
 *
 * 所以规则是：底部条只允许向上长高，不允许改变任何按钮的位置；关闭与计数
 * 钉死在四角，与「这张图有没有识别内容」完全解耦。
 */
export default function ShotLightbox({
  shots, canEdit, onClose, onChanged,
}: {
  shots: CompetitorShot[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('competitors')
  const tCommon = useTranslations('common')
  // 开播时刻按界面语言换算（ja=日本 / zh=北京 / en=加州），库里是 UTC。
  const locale = useLocale()
  const [start, setStart] = useState(0)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [settled, setSettled] = useState<Set<string>>(() => new Set())
  // 惰性初始化而不是先给 3 再用 effect 纠正:后者会让手机上先画出三连排、
  // 下一帧才塌回单图。灯箱只在用户点开某天后才渲染,不参与 SSR,所以这里
  // 读 window 不会有 hydration 不一致;guard 只是防御性的。
  const [perView, setPerView] = useState(() =>
    typeof window === 'undefined'
      ? LIGHTBOX_VISIBLE
      : visibleCountFor(window.innerWidth, window.innerHeight, LIGHTBOX_VISIBLE),
  )
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 编辑区默认折叠。改日期、删图都是低频操作,而它俩(尤其原生 date 控件)是
  // 这条底部条里最占横向空间的一块;常年摊开等于让高频的「看图」给低频的
  // 「修数据」让位。折叠还顺带把删除键从关闭键旁边挪走了 —— 破坏性操作和
  // 退出操作原先紧挨着,是误触的现成温床。
  const [editOpen, setEditOpen] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)
  // 只有真的被截断才给「展开」:一行就完的 caption 后面挂个展开钮是纯噪音。
  const [captionClipped, setCaptionClipped] = useState(false)
  const captionRef = useRef<HTMLParagraphElement | null>(null)
  // 视口变化后 caption 的折行数会变,得重测一次。单开一个计数器而不是复用
  // perView:宽度变了但并排张数没变的情况很常见(750→900 都是 2 张)。
  const [measureTick, setMeasureTick] = useState(0)

  // 渲染期夹逼,不放 useEffect:effect 版本在 shots 变短时会先渲染出
  // 越界的一帧(整个灯箱闪掉),effect 跑完才回来。
  const from = clampWindowStart(start, shots.length, perView)
  const visible = shots.slice(from, from + perView)

  // 兜底到窗口首张,一次覆盖"选中项被删"与"选中项滑出窗口"两种情况。
  // 删除不可逆,作用对象必须永远在画面里。
  const selected = visible.find((s) => s.id === pickedId) ?? visible[0]

  // 窗口里任何一张没就位就整排不显示。未加载的 img 固有尺寸是 0x0,外层按钮
  // 会塌成零宽 —— 当天三张里慢到一张,画面上就只剩两张,被读成"这天只有两张"。
  // 单图时代这个行为一直存在,只是看不出来(就一张图,你只会觉得在加载)。
  const allVisibleReady = visible.every((s) => settled.has(s.id))

  // 依赖两个原始值而不是 selected 对象本身:调用方每次渲染换引用也不会重复触发,
  // 同时满足 exhaustive-deps(依赖数组不参与类型检查,靠 lint 兜底,别写成对象)。
  const selectedId = selected?.id
  const selectedShotOn = selected?.shot_on ?? ''
  const selectedCaption = selected?.caption ?? ''

  // 底部条渲染哪几段。判据是纯函数,测试在 lib/competitors/shotDock.test.ts:
  // 三段全空时整条不渲染 —— 只读 + 人工上传那一态画面上只剩图和四角的 chrome。
  const dock = shotDockSections(selected, canEdit)

  useEffect(() => {
    setDateInput(selectedShotOn)
    setError(null)
    // 换一张图就收起 caption:上一张的展开态套到新 caption 上没有意义。
    // 编辑区反过来保持不动 —— 清理某天的多张图时会连着删好几张。
    setCaptionOpen(false)
  }, [selectedId, selectedShotOn])

  // 预加载当天全部截图,顺带记录每张的"已结束"状态。预加载整天(通常 3-6 张)
  // 而不只是当前窗口,是为了让窗口外的图提前开始下载,滑过去时多半已在缓存里。
  // 注意这只是"多半":实测若在某张下载完成前就按箭头滑到它,仍会看到加载态。
  // onerror 也记为已结束:否则一张 404 的图会把整排永远卡在加载态(已实测)。
  useEffect(() => {
    let alive = true
    const loaders = shots.map((s) => {
      const img = new Image()
      const done = () => {
        if (!alive) return
        setSettled((prev) => (prev.has(s.id) ? prev : new Set(prev).add(s.id)))
      }
      img.onload = done
      img.onerror = done
      img.src = s.image_url
      return img
    })
    return () => {
      alive = false
      for (const img of loaders) { img.onload = null; img.onerror = null }
    }
  }, [shots])

  // 旋转屏幕或改窗口大小时重算并排张数:横竖屏切换会让"放不放得下三张"整个反过来
  // (竖屏平板放不下、横过来就放得下)。
  useEffect(() => {
    const measure = () => {
      setPerView(visibleCountFor(window.innerWidth, window.innerHeight, LIGHTBOX_VISIBLE))
      setMeasureTick((n) => n + 1)
    }
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  // caption 有没有被 line-clamp 截断。展开态下 scrollHeight === clientHeight,
  // 测不出来也不必测 —— 能展开就说明刚才截断过,直接留着收起钮。
  useEffect(() => {
    if (captionOpen) return
    const el = captionRef.current
    if (!el) { setCaptionClipped(false); return }
    // +1 容差:子像素行高会让没截断的段落也差出零点几 px。
    setCaptionClipped(el.scrollHeight > el.clientHeight + 1)
  }, [selectedId, selectedCaption, captionOpen, measureTick])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 灯箱打开期间锁掉底层页面滚动。遮罩盖住整屏但不吃滚轮事件,在图上滚会把
  // 下面的竞品列表滚走 —— 关掉灯箱才发现位置全变了,而日期列是靠位置对应的。
  //
  // 走全站共用的 lockViewportScroll():锁 <html>、补滚动条槽宽避免横向跳、
  // 解锁读回原内联值。锁哪个元素为什么这么选、以及验证时必须用真实滚轮事件
  // (window.scrollTo 会给假阴性),都写在 lib/ui/scrollLock.ts 的头注释里。
  //
  // 早先这里的注释断言「给 body 加 overflow:hidden 完全不起作用」——那句是错的。
  // 后来用真实滚轮实测:CSS 的 overflow 视口传播规则下,<html> 两轴都是 visible 时
  // UA 改用 body 的 overflow 作用于视口,所以 body 锁同样拦得住(Sidebar 的移动端
  // 抽屉一直靠它)。选 documentElement 的真实理由是它无条件成立,不依赖那个前提。
  useEffect(() => lockViewportScroll(), [])

  if (!selected) return null

  const atStart = from <= 0
  const atEnd = from + perView >= shots.length
  const selectedIndex = shots.findIndex((s) => s.id === selected.id)
  const startedAt = formatDayTimeInLocaleZone(selected.stream_started_at, locale)
  const uptime = shotUptimeParts(selected.stream_started_at, selected.captured_at)

  // 箭头既翻窗口也换选中:选中新进来的那一张,读作"看下一张",
  // 与改版前单图模式的心智模型一致。
  const step = (direction: -1 | 1) => {
    const next = clampWindowStart(from + direction, shots.length, perView)
    const win = shots.slice(next, next + perView)
    const pick = direction === 1 ? win[win.length - 1] : win[0]
    setStart(next)
    if (pick) setPickedId(pick.id)
  }

  const saveDate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_on: dateInput || null }),
      })
      // 只有 400 才是日期本身的问题;401/500 也说成"日期格式不对"
      // 会让人反复重打一个根本没错的日期
      if (!res.ok) { setError(res.status === 400 ? t('shotDateInvalid') : t('actionFailed')); return }
      await onChanged()
      onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const removeSelected = async () => {
    if (!confirm(t('deleteShotConfirm'))) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/shots/${selected.id}`, { method: 'DELETE' })
      if (!res.ok) { setError(t('actionFailed')); return }
      await onChanged()
      // 只在删掉最后一张时才关。否则清理某天的多张图要"开→删→关→再开"
      // 循环一遍;留着不关的话,refetch 后 shots 变短、窗口与选中都会自动夹逼兜底。
      if (shots.length <= 1) onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-label={selected.shot_on ?? t('undated')}
    >
      {/*
        不写 aria-modal:本仓约定是没有 focus trap 就不许声明它
        (见 tasks/page.tsx 的同款注释),否则等于骗读屏说外面已经 inert。
        全套 focus trap 在 components/ui/Modal.tsx,这里用不上,Esc 关闭已够。
      */}

      {/* ── A 层:固定 chrome ──────────────────────────────────────────
          计数与关闭钉在四角,位置只跟视口有关,跟这张图有没有 caption / 直播态
          无关。计数条 pointer-events-none,点它等于点遮罩(关闭),不留死角。 */}
      <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-btn bg-black/55 px-2.5 py-1 text-xs tabular-nums text-white backdrop-blur">
        {t('shotIndexOf', { index: selectedIndex + 1, total: shots.length })}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label={t('closeShot')}
        className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-icon bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring sm:h-10 sm:w-10"
      >
        <X size={18} />
      </button>

      {/* ── B 层:舞台 ────────────────────────────────────────────────
          min-h-0 才能让 flex-1 真的压缩(默认 min-height:auto 会撑破容器)。
          不在这一层 stopPropagation:图两侧的空白点下去应该关闭灯箱,跟改版前
          一致;拦截只做在真正的内容那一格上。 */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-3">
        <div className="flex max-h-full items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={atStart}
            aria-label={t('prevShot')}
            className="shrink-0 rounded-icon bg-black/50 p-2 text-white disabled:opacity-30"
          >
            <ChevronLeft size={20} />
          </button>
          {/*
            并排 perView 张(由视口算出,手机与竖屏平板为 1)。当天不足这么多就有几张排几张——
            这一行在舞台里居中,所以不足 3 张时会自然居中,不需要占位空格。
            min-w-0 是为了极窄视口下等比缩小而不是横向溢出。

            max-h-[64vh] 必须与 shotGrid.ts 的 IMAGE_MAX_VH 同步,那边靠它反推单张宽度
            算并排容量。底部条另有 max-h-[30vh] 上限,12+64+3+30 < 100vh,两者不会打架。
          */}
          {allVisibleReady ? (
            visible.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPickedId(s.id)}
                aria-pressed={s.id === selected.id}
                aria-label={s.caption || s.tag || s.shot_on || t('undated')}
                className={`min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
                  s.id === selected.id ? 'ring-2 ring-primary' : ''
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.image_url}
                  alt={s.caption || s.tag || ''}
                  className="max-h-[64vh] max-w-full rounded-lg"
                />
              </button>
            ))
          ) : (
            <div
              role="status"
              className="flex h-[64vh] items-center justify-center gap-2 px-24 text-xs text-white"
            >
              <Loader2 size={16} className="animate-spin" />
              <span>{tCommon('loading')}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atEnd}
            aria-label={t('nextShot')}
            className="shrink-0 rounded-icon bg-black/50 p-2 text-white disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* ── C 层:底部条 ──────────────────────────────────────────────
          手机上贴底通栏(rounded-t-card),宽度由视口决定而不是由内容决定 ——
          改版前那种「内容撑到 722px、按钮被推出屏幕」在结构上就不可能再发生;
          桌面收成一张浮起的卡。max-h-[30vh] + overflow-y-auto 是给展开后的长
          caption 兜底,不让它把舞台顶掉。 */}
      {dock.any && (
        <div className="sm:px-6 sm:pb-6" onClick={(e) => e.stopPropagation()}>
          <div
            className="mx-auto flex max-h-[30vh] w-full max-w-[720px] flex-col gap-2 overflow-y-auto rounded-t-card bg-black/55 px-3 pt-2.5 text-xs text-white backdrop-blur sm:rounded-card"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.625rem)' }}
          >
            {/* 画面内容备注：Claude 人眼核实截图时顺手写的一句话概括(≤200 字)，供人回看时
                不用重新点开图自己认。人工上传的截图这个字段是空串，整段不出现。 */}
            {dock.caption && (
              <div>
                <p
                  ref={captionRef}
                  className={`whitespace-pre-wrap text-white/85 ${captionOpen ? '' : 'line-clamp-2'}`}
                >
                  {selected.caption}
                </p>
                {(captionClipped || captionOpen) && (
                  <button
                    type="button"
                    onClick={() => setCaptionOpen((v) => !v)}
                    aria-expanded={captionOpen}
                    className="mt-0.5 rounded-btn text-white/70 underline underline-offset-2 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                  >
                    {captionOpen ? t('captionLess') : t('captionMore')}
                  </button>
                )}
              </div>
            )}

            {/* 自动采集的直播态。人工上传的截图这几项为 null,整段不出现。
                开播时刻是直播间自己报的 stream_started_at(同一场的多张截图值一致),
                时长只说明「截图时已播多久」,看不出对方的开播作息,所以两个都给。 */}
            {dock.meta && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-white/80">
                {selected.viewer_count != null && (
                  <span>{t('shotViewers', { count: selected.viewer_count })}</span>
                )}
                {startedAt && <span>{t('shotStartedAt', { time: startedAt })}</span>}
                {/* 不足 1 小时只显示分钟,免得出现"0时20分" */}
                {uptime && (
                  <span>
                    {uptime.h > 0
                      ? t('shotUptime', { h: uptime.h, m: uptime.m })
                      : t('shotUptimeMin', { m: uptime.m })}
                  </span>
                )}
              </div>
            )}

            {dock.edit && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditOpen((v) => !v)}
                    aria-expanded={editOpen}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-btn border px-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring sm:h-8 ${
                      editOpen ? 'border-transparent bg-white/15' : 'border-white/25 hover:bg-white/10'
                    }`}
                  >
                    <Pencil size={14} />
                    {tCommon('edit')}
                  </button>
                </div>
                {editOpen && (
                  <>
                    <div className="h-px bg-white/15" />
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 手机上日期控件独占一行:iOS 的原生 date 控件很宽,
                          跟保存钮挤一行会把后者压到换行,读起来像两个无关按钮。 */}
                      <label className="flex w-full items-center gap-1.5 sm:w-auto">
                        <span className="shrink-0 text-white/80">{t('shotDate')}</span>
                        <input
                          type="date"
                          value={dateInput}
                          max={todayLocal()}
                          onChange={(e) => setDateInput(e.target.value)}
                          className="min-w-0 flex-1 rounded-field border border-line-strong px-2 py-1 text-ink-900 sm:flex-none"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={saveDate}
                        disabled={busy}
                        className="inline-flex h-9 items-center rounded-btn bg-primary-gradient px-3 font-medium text-white transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring disabled:opacity-50 sm:h-8"
                      >
                        {t('saveShotDate')}
                      </button>
                      {/* 破坏性操作:手机上给足 44px 触达区,并靠 ml-auto 推到最右,
                          与保存钮之间永远留着一段空白。关闭键在右上角,跟它隔了整个舞台。 */}
                      <button
                        type="button"
                        onClick={removeSelected}
                        disabled={busy}
                        aria-label={t('delete')}
                        className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-icon bg-black/50 text-white transition-colors hover:bg-danger-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring disabled:opacity-50 sm:h-8 sm:w-8"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 错误挂在底部条内部而不是外面:挂外面的话它一出现就把整列往上顶一次,
                等于操作成功与否都会让画面跳。 */}
            {error && (
              <p role="status" className="rounded-field bg-danger-strong px-2 py-1 text-white">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
