// src/components/competitors/ShotLightbox.tsx
'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Loader2, Trash2, X } from 'lucide-react'
import type { CompetitorShot } from '@/lib/competitors/types'
import { shotUptimeParts } from '@/lib/competitors/types'
import { todayLocal } from '@/lib/competitors/localDate'
import { LIGHTBOX_VISIBLE, clampWindowStart, visibleCountFor } from '@/lib/competitors/shotGrid'
import { formatDayTimeInLocaleZone } from '@/lib/time/localeZone'
import { lockViewportScroll } from '@/lib/ui/scrollLock'

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

  useEffect(() => {
    setDateInput(selectedShotOn)
    setError(null)
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
    const measure = () =>
      setPerView(visibleCountFor(window.innerWidth, window.innerHeight, LIGHTBOX_VISIBLE))
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-6"
      onClick={onClose}
      role="dialog"
      aria-label={selected.shot_on ?? t('undated')}
    >
      {/*
        不写 aria-modal:本仓约定是没有 focus trap 就不许声明它
        (见 tasks/page.tsx 的同款注释),否则等于骗读屏说外面已经 inert。
        全套 focus trap 在 components/ui/Modal.tsx,这里用不上,Esc 关闭已够。
      */}
      <div className="flex max-h-[80vh] items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label={t('prevShot')}
          className="shrink-0 rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        {/*
          并排 perView 张(由视口算出,手机与竖屏平板为 1)。当天不足这么多就有几张排几张——
          父层是 flex-col,横向居中由 items-center(交叉轴)负责,所以不足 3 张时
          这一行会自然居中,不需要占位空格。
          min-w-0 是为了极窄视口下等比缩小而不是横向溢出。
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
          className="shrink-0 rounded bg-black/50 p-2 text-white disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-white" onClick={(e) => e.stopPropagation()}>
        <span>{t('shotIndexOf', { index: selectedIndex + 1, total: shots.length })}</span>
        {/* 自动采集的直播态：在线人数 + 截图时已播时长。人工上传的截图这两项为 null,整段不出现。 */}
        {selected.viewer_count != null && (
          <span className="opacity-80">{t('shotViewers', { count: selected.viewer_count })}</span>
        )}
        {/* 开播时刻：直播间自己报的 stream_started_at，同一场的多张截图值一致。
            时长只说明「截图时已播多久」，看不出对方的开播作息，所以两个都给。 */}
        {formatDayTimeInLocaleZone(selected.stream_started_at, locale) && (
          <span className="opacity-80 tabular-nums">
            {t('shotStartedAt', { time: formatDayTimeInLocaleZone(selected.stream_started_at, locale)! })}
          </span>
        )}
        {(() => {
          const up = shotUptimeParts(selected.stream_started_at, selected.captured_at)
          if (!up) return null
          // 不足 1 小时只显示分钟,免得出现"0时20分"
          return (
            <span className="opacity-80">
              {up.h > 0 ? t('shotUptime', { h: up.h, m: up.m }) : t('shotUptimeMin', { m: up.m })}
            </span>
          )
        })()}
        {canEdit && (
          <>
            <label className="flex items-center gap-1">
              <span>{t('shotDate')}</span>
              <input
                type="date"
                value={dateInput}
                max={todayLocal()}
                onChange={(e) => setDateInput(e.target.value)}
                className="rounded border border-line-strong px-1.5 py-0.5 text-ink-900"
              />
            </label>
            <button
              type="button"
              onClick={saveDate}
              disabled={busy}
              className="rounded bg-primary px-2 py-1 text-white disabled:opacity-50"
            >
              {t('saveShotDate')}
            </button>
            {/* 破坏性操作:手机上给足 44px 触达区,并与两侧(尤其关闭)拉开间距,防误触 */}
            <button
              type="button"
              onClick={removeSelected}
              disabled={busy}
              aria-label={t('delete')}
              className="mx-1 inline-flex h-11 w-11 items-center justify-center rounded bg-black/50 text-white hover:bg-danger-strong disabled:opacity-50 sm:mx-0 sm:h-8 sm:w-8"
            >
              <Trash2 size={18} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('closeShot')}
          className="inline-flex h-11 w-11 items-center justify-center rounded bg-black/50 text-white sm:h-8 sm:w-8"
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <p
          role="status"
          onClick={(e) => e.stopPropagation()}
          className="rounded bg-danger-strong px-2 py-1 text-xs text-white"
        >
          {error}
        </p>
      )}
    </div>
  )
}
