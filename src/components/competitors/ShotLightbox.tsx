// src/components/competitors/ShotLightbox.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize2, Minimize2, Package, Pencil, Trash2, X } from 'lucide-react'
import type { CompetitorShot } from '@/lib/competitors/types'
import { shotUptimeParts } from '@/lib/competitors/types'
import { maxShotDate } from '@/lib/competitors/localDate'
import { lightboxNeighbors } from '@/lib/competitors/lightboxLayout'
import { shotOverlaySections } from '@/lib/competitors/shotOverlay'
import { dayZipName, shotFileName } from '@/lib/competitors/shotDownload'
import { fetchBytes, saveBlob } from '@/lib/competitors/downloadFile'
import { buildZip } from '@/lib/competitors/zip'
import { formatDayTimeInLocaleZone } from '@/lib/time/localeZone'
import { lockViewportScroll } from '@/lib/ui/scrollLock'

/**
 * 一张主图 + 宽屏时两侧各露一张。所有信息都叠在主图身上。
 *
 * 为什么不是「并排三张等大 + 底部一条说明」（本组件此前两版的形态）：
 * 三张一样大时，底部那条说明描述的只是选中那张，看的人得先弄清楚它在说谁 ——
 * `1/3` 这个数字其实就是在补救这个歧义。改成主图 + 明显更小更暗的邻图之后，
 * 谁是主角由尺寸和明度直接说清楚，说明贴在主图身上，归属不需要任何补救。
 *
 * 尺寸判据（放不放得下邻图、主图多高）全在 lib/competitors/lightboxLayout.ts，
 * 渐变层渲染哪几段在 lib/competitors/shotOverlay.ts，两者都是纯函数且有测试。
 *
 * 下面几个 vh 字面量必须与那两个常量同步（Tailwind 只认字面量，不能插值）：
 *   max-h-[80vh] ↔ MAIN_MAX_VH     主图折叠态
 *   max-h-[62vh] ↔ MAIN_EDITING_NARROW_VH 窄屏编辑态(≥sm 不缩,靠整列变高把图顶上去)
 *   max-h-[50vh] ↔ MAIN_MAX_VH × PEEK_SCALE  邻图
 */
export default function ShotLightbox({
  shots, handle, dateKey, canEdit, onClose, onChanged,
}: {
  shots: CompetitorShot[]
  /** 对方平台上的用户名。只用于下载文件名。 */
  handle: string
  /** 当天的日期键（未标日期那一列为 UNDATED_KEY）。只用于打包文件名。 */
  dateKey: string
  canEdit: boolean
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const t = useTranslations('competitors')
  const tCommon = useTranslations('common')
  // 开播时刻按界面语言换算（ja=日本 / zh=北京 / en=加州），库里是 UTC。
  const locale = useLocale()
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [settled, setSettled] = useState<Set<string>>(() => new Set())
  // 惰性初始化而不是先给一个默认值再用 effect 纠正:后者会让宽屏上先画出没有邻图的
  // 一帧、下一帧才把两侧补进来。灯箱只在用户点开某天后才渲染,不参与 SSR,
  // 所以这里读 window 不会有 hydration 不一致;guard 只是防御性的。
  const [viewport, setViewport] = useState(() =>
    typeof window === 'undefined'
      ? { w: 0, h: 0 }
      : { w: window.innerWidth, h: window.innerHeight },
  )
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 编辑区默认折叠。改日期、删图都是低频操作,常年摊开等于让高频的"看图"给低频的
  // "修数据"让位;折叠还顺带把删除键从关闭键旁边挪走了。
  const [editOpen, setEditOpen] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)
  // 只有真的被截断才给"展开":一行就完的备注后面挂个展开钮是纯噪音。
  const [captionClipped, setCaptionClipped] = useState(false)
  const captionRef = useRef<HTMLParagraphElement | null>(null)
  // 仅看图：把日期/序号胶囊、渐变层、邻图全收起来,只留主图和右上角两颗钮。
  // TikTok 直播截图最要紧的礼物栏、排行榜、评论都压在画面下缘,而渐变层正好
  // 盖在那儿(常态占主图 32%) —— 这个模式存在的理由就是把那块让出来。
  const [cleanView, setCleanView] = useState(false)
  // 下载进度。打包一天六张(每张上限 5MB)要花几秒,不给反馈会被当成没点上。
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null)

  // 选中项兜底到第一张,一次覆盖"选中项被删"与"刚打开还没选"两种情况。
  // 删除不可逆,作用对象必须永远在画面里。
  const selected = shots.find((s) => s.id === pickedId) ?? shots[0]
  const index = selected ? shots.findIndex((s) => s.id === selected.id) : -1

  const neighbors = lightboxNeighbors(viewport.w, viewport.h, shots.length, index)
  const leftShot = neighbors.left ? shots[index - 1] : undefined
  const rightShot = neighbors.right ? shots[index + 1] : undefined

  // 主图和要画的邻图全部就位才显示。未加载的 img 固有尺寸是 0x0,外层会塌成零宽 ——
  // 邻图塌掉时画面上就只剩主图,会被读成"这边没有了",而不是"还在加载"。
  const shown = [selected, leftShot, rightShot].filter(Boolean) as CompetitorShot[]
  const allReady = shown.length > 0 && shown.every((s) => settled.has(s.id))

  // 依赖原始值而不是 selected 对象本身:调用方每次渲染换引用也不会重复触发,
  // 同时满足 exhaustive-deps(依赖数组不参与类型检查,靠 lint 兜底,别写成对象)。
  const selectedId = selected?.id
  const selectedShotOn = selected?.shot_on ?? ''
  const selectedCaption = selected?.caption ?? ''

  // 渐变层渲染哪几段。四段全空(只读 + 人工上传 + 当天仅此一张)时整层不画,
  // 画面上只剩左上角那两颗胶囊。
  const ov = shotOverlaySections(selected, canEdit, shots.length)

  useEffect(() => {
    setDateInput(selectedShotOn)
    setError(null)
    // 换一张图就收起备注:上一张的展开态套到新备注上没有意义。
    // 编辑区反过来保持不动 —— 清理某天的多张图时会连着删好几张。
    setCaptionOpen(false)
  }, [selectedId, selectedShotOn])

  // 预加载当天全部截图。预加载整天(通常 3-6 张)而不只是当前三张,是为了让画面外的图
  // 提前开始下载,翻过去时多半已在缓存里。注意这只是"多半":实测若在某张下载完成前就
  // 翻到它,仍会看到加载态。onerror 也记为已结束:否则一张 404 的图会把画面永远
  // 卡在加载态(已实测)。
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

  // 旋转屏幕或改窗口大小时重新判断放不放得下邻图:横竖屏切换会让结论整个反过来
  // (竖屏平板放不下、横过来就放得下)。顺带触发备注的截断重测。
  useEffect(() => {
    const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  // 备注有没有被 line-clamp 截断。展开态下 scrollHeight === clientHeight,
  // 测不出来也不必测 —— 能展开就说明刚才截断过,直接留着收起钮。
  useEffect(() => {
    if (captionOpen) return
    const el = captionRef.current
    if (!el) { setCaptionClipped(false); return }
    // +1 容差:子像素行高会让没截断的段落也差出零点几 px。
    setCaptionClipped(el.scrollHeight > el.clientHeight + 1)
  }, [selectedId, selectedCaption, captionOpen, viewport.w, viewport.h, editOpen])

  // 翻页:纯 index 位移,夹逼到两端。没有窗口概念了,比改版前的"窗口起点 + 选中项"
  // 两套状态简单得多。
  const step = useCallback((direction: -1 | 1) => {
    setPickedId((prev) => {
      const at = shots.findIndex((s) => s.id === prev)
      const from = at >= 0 ? at : 0
      const next = Math.min(Math.max(from + direction, 0), shots.length - 1)
      return shots[next]?.id ?? prev
    })
  }, [shots])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Esc 分两段:先退出仅看图,再关灯箱。一键直接关掉的话,进了仅看图就等于
        // 把"退出这个模式"和"关掉整个灯箱"绑成同一个动作,想回到信息层只能重开。
        //
        // 判断写在 updater 外面:React 会重复调用 setState 的 updater(StrictMode 下
        // 必然如此),把 onClose() 这种副作用塞进去会被调两次。
        if (cleanView) setCleanView(false)
        else onClose()
        return
      }
      // 左右方向键翻页:画面已经是个横向轮播,方向键是这个形态的默认预期。
      // 焦点在日期输入框里时不抢 —— 那里左右键是移动光标。
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, step, cleanView])

  // 灯箱打开期间锁掉底层页面滚动。遮罩盖住整屏但不吃滚轮事件,在图上滚会把
  // 下面的竞品列表滚走 —— 关掉灯箱才发现位置全变了,而日期列是靠位置对应的。
  //
  // 走全站共用的 lockViewportScroll():锁 <html>、补滚动条槽宽避免横向跳、
  // 解锁读回原内联值。锁哪个元素为什么这么选、以及验证时必须用真实滚轮事件
  // (window.scrollTo 会给假阴性),都写在 lib/ui/scrollLock.ts 的头注释里。
  useEffect(() => lockViewportScroll(), [])

  if (!selected) return null

  const atStart = index <= 0
  const atEnd = index >= shots.length - 1
  const startedAt = formatDayTimeInLocaleZone(selected.stream_started_at, locale)
  const uptime = shotUptimeParts(selected.stream_started_at, selected.captured_at)
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

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

  // 单张：先取回字节再存。跨源地址上的 download 属性会被忽略(点下去变成新标签页
  // 打开图片),必须先变成同源 blob —— 细节在 lib/competitors/downloadFile.ts。
  const downloadOne = async () => {
    setSaving({ done: 0, total: 1 })
    setError(null)
    try {
      const bytes = await fetchBytes(selected.image_url)
      saveBlob(bytes, shotFileName(handle, selected, index, shots.length), 'application/octet-stream')
    } catch {
      setError(t('downloadFailed'))
    } finally {
      setSaving(null)
    }
  }

  // 当天打包。逐张顺序取而不是 Promise.all:一天最多几张,顺序取能报出真实进度,
  // 而并发取六个 5MB 在弱网上更容易整批超时。任一张失败就整批放弃 —— 悄悄少一张的
  // 压缩包比直接失败更糟,人不会发现。
  const downloadDay = async () => {
    setSaving({ done: 0, total: shots.length })
    setError(null)
    try {
      const entries = []
      for (let i = 0; i < shots.length; i++) {
        const data = await fetchBytes(shots[i].image_url)
        entries.push({ name: shotFileName(handle, shots[i], i, shots.length), data })
        setSaving({ done: i + 1, total: shots.length })
      }
      saveBlob(buildZip(entries), dayZipName(handle, selected.shot_on ?? dateKey), 'application/zip')
    } catch {
      setError(t('downloadFailed'))
    } finally {
      setSaving(null)
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
      // 只在删掉最后一张时才关。否则清理某天的多张图要"开→删→关→再开"循环一遍;
      // 留着不关的话,refetch 后 shots 变短、选中项会自动兜底到第一张。
      if (shots.length <= 1) onClose()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  // 邻图绝对定位挂在主图两侧,不进正常流 —— 让它们参与布局的话,首张(只有右邻)与
  // 中间张(左右都有)的整组宽度不同,居中后主图会左右漂移约 112px(1280×800 实测)。
  // 主图恒定居中,是这一版最要紧的一条:画面里唯一的主体不该因为"翻到第几张"换位置。
  const peek = (shot: CompetitorShot, side: 'left' | 'right') => (
    <button
      type="button"
      onClick={(e) => { stop(e); setPickedId(shot.id) }}
      aria-label={side === 'left' ? t('prevShot') : t('nextShot')}
      className={`absolute top-1/2 hidden -translate-y-1/2 rounded-lg opacity-40 transition-opacity hover:opacity-75 focus:outline-none focus-visible:opacity-75 focus-visible:ring-2 focus-visible:ring-primary-ring sm:block ${
        side === 'left' ? 'right-full mr-4' : 'left-full ml-4'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.image_url} alt="" className="max-h-[50vh] max-w-none rounded-lg" />
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-3"
      onClick={onClose}
      role="dialog"
      aria-label={selected.shot_on ?? t('undated')}
    >
      {/*
        不写 aria-modal:本仓约定是没有 focus trap 就不许声明它
        (见 tasks/page.tsx 的同款注释),否则等于骗读屏说外面已经 inert。
        全套 focus trap 在 components/ui/Modal.tsx,这里用不上,Esc 关闭已够。
      */}

      {/* 错误浮条。绝对定位所以不占流、不顶版式;放在这一层而不是编辑区里面,是因为
          下载失败时编辑区多半是收起的 —— 挂在里面等于报了个没人看得见的错(实测踩到)。
          仅看图模式下也照样显示:那时候更需要知道刚才那下为什么没反应。 */}
      {error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <p role="status" className="rounded-btn bg-danger-strong px-3 py-1.5 text-xs text-white shadow-pop">
            {error}
          </p>
        </div>
      )}

      {/* 右上角一组:下载 / 打包 / 仅看图 / 关闭。位置只跟视口有关,跟这张图有什么
          内容无关。下载两颗在仅看图模式下收起 —— 那个模式的整个意思就是"只剩图"。 */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5" onClick={stop}>
        {!cleanView && (
          <>
            <button
              type="button"
              onClick={downloadOne}
              disabled={saving !== null}
              aria-label={t('downloadShot')}
              title={t('downloadShot')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-icon bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring disabled:opacity-50 sm:h-10 sm:w-10"
            >
              {saving && saving.total === 1
                ? <Loader2 size={18} className="animate-spin" />
                : <Download size={18} />}
            </button>
            {shots.length > 1 && (
              <button
                type="button"
                onClick={downloadDay}
                disabled={saving !== null}
                aria-label={t('downloadDay', { count: shots.length })}
                title={saving && saving.total > 1
                  ? t('downloading', { done: saving.done, total: saving.total })
                  : t('downloadDay', { count: shots.length })}
                className="inline-flex h-11 w-11 items-center justify-center rounded-icon bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring disabled:opacity-50 sm:h-10 sm:w-10"
              >
                {saving && saving.total > 1
                  ? <span className="text-xs tabular-nums">{saving.done}/{saving.total}</span>
                  : <Package size={18} />}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => setCleanView((v) => !v)}
          aria-pressed={cleanView}
          aria-label={cleanView ? t('exitViewOnly') : t('viewOnly')}
          title={cleanView ? t('exitViewOnly') : t('viewOnly')}
          className="inline-flex h-11 w-11 items-center justify-center rounded-icon bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring disabled:opacity-50 sm:h-10 sm:w-10"
        >
          {cleanView ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('closeShot')}
          className="inline-flex h-11 w-11 items-center justify-center rounded-icon bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring disabled:opacity-50 sm:h-10 sm:w-10"
        >
          <X size={18} />
        </button>
      </div>

      {/* 翻页箭头贴视口两侧,不跟着图的宽度跑。窄屏上邻图不出,全靠它们翻。 */}
      {!atStart && (
        <button
          type="button"
          onClick={(e) => { stop(e); step(-1) }}
          aria-label={t('prevShot')}
          className="absolute left-2 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-icon bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring sm:h-10 sm:w-10"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          onClick={(e) => { stop(e); step(1) }}
          aria-label={t('nextShot')}
          className="absolute right-2 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-icon bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring sm:h-10 sm:w-10"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {allReady ? (
        <div className="flex max-w-full items-center justify-center">
          {/* 主列:主图 +(编辑展开时)图下方的编辑区。整列在舞台里居中,所以展开编辑区
              会把主图往上顶 —— 这正是"编辑时主图上移"的实现方式,不需要额外的位移。
              relative 是给两侧绝对定位的邻图当定位参照。 */}
          <div className="relative flex min-w-0 flex-col items-stretch gap-3" onClick={stop}>
            {!cleanView && leftShot && peek(leftShot, 'left')}
            {!cleanView && rightShot && peek(rightShot, 'right')}
            <div className="relative min-w-0">
              {/* 点图切换仅看图:看图应用里"轻点画面收起界面"是默认预期,而且在手机上
                  比够到右上角那颗钮方便得多。用 button 包住是为了键盘也能触达。
                  仅看图下邻图收起,让出来的横向空间给主图,上限从 80vh 提到 92vh。 */}
              <button
                type="button"
                onClick={() => setCleanView((v) => !v)}
                aria-pressed={cleanView}
                aria-label={cleanView ? t('exitViewOnly') : t('viewOnly')}
                className="block max-w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.image_url}
                  alt={selected.caption || selected.tag || ''}
                  className={`max-w-full rounded-card ${
                    cleanView
                      ? 'max-h-[92vh]'
                      : editOpen ? 'max-h-[62vh] sm:max-h-[80vh]' : 'max-h-[80vh]'
                  }`}
                />
              </button>

              {/* 日期与序号并排贴左上。序号不能放右上 —— 手机上主图占满时会和
                  关闭键叠在一起(静态稿实测撞上了)。 */}
              {!cleanView && (
              <div className="absolute left-2.5 top-2.5 flex max-w-[calc(100%-12rem)] items-center gap-1.5">
                <span
                  className={`truncate rounded-btn px-2.5 py-1 text-xs font-semibold tabular-nums backdrop-blur ${
                    selected.shot_on ? 'bg-black/60 text-white' : 'bg-warning-dot text-ink-900'
                  }`}
                >
                  {selected.shot_on ?? t('undated')}
                </span>
                {shots.length > 1 && (
                  <span className="rounded-btn bg-black/60 px-2 py-1 text-xs tabular-nums text-white backdrop-blur">
                    {t('shotIndexOf', { index: index + 1, total: shots.length })}
                  </span>
                )}
              </div>
              )}

              {/* 底部渐变层。四段全空时整层不画;仅看图下一律不画。 */}
              {!cleanView && ov.footer && (
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 rounded-b-card bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pb-3 pt-10 text-xs text-white">
                  {/* 自动采集的直播态。开播时刻是直播间自己报的 stream_started_at
                      (同一场的多张截图值一致),时长只说明「截图时已播多久」,
                      看不出对方的开播作息,所以两个都给。 */}
                  {ov.live && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-white/75">
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

                  {/* 画面内容备注：Claude 人眼核实截图时顺手写的一句话概括(≤200 字)，
                      供人回看时不用重新点开图自己认。人工上传的截图这个字段是空串。 */}
                  {ov.caption && (
                    <div>
                      <p
                        ref={captionRef}
                        className={`whitespace-pre-wrap ${
                          captionOpen ? 'max-h-[28vh] overflow-y-auto' : 'line-clamp-2'
                        }`}
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

                  {(ov.strip || ov.edit) && (
                    <div className="flex items-center gap-1.5">
                      {/* 胶片条:当天全部张数直接可见,序号写在片上。只读 + 人工上传的多张
                          也要留着它 —— 否则画面上没有任何"共几张"的交代。 */}
                      {ov.strip && (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                          {shots.map((s, i) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setPickedId(s.id)}
                              aria-pressed={s.id === selected.id}
                              aria-label={t('shotIndexOf', { index: i + 1, total: shots.length })}
                              className={`relative h-9 w-6 shrink-0 overflow-hidden rounded-field border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
                                s.id === selected.id ? 'border-primary' : 'border-transparent opacity-60'
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.image_url} alt="" className="h-full w-full object-cover" />
                              <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] leading-3 tabular-nums text-white">
                                {i + 1}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {ov.edit && (
                        <button
                          type="button"
                          onClick={() => setEditOpen((v) => !v)}
                          aria-expanded={editOpen}
                          className={`ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-btn border px-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring sm:h-8 ${
                            editOpen ? 'border-transparent bg-white/20' : 'border-white/30 bg-black/40 hover:bg-white/10'
                          }`}
                        >
                          <Pencil size={14} />
                          {tCommon('edit')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 编辑区在**图的下方**,不叠在图上:叠着的版本实测会盖住主图 51%,
                一边改日期一边看不见图。宽度跟着主图(items-stretch),读作"改的就是它"。 */}
            {ov.edit && editOpen && (
              <div className="flex flex-wrap items-center gap-2 rounded-card bg-black/55 px-3 py-2.5 text-xs text-white backdrop-blur">
                {/* 手机上日期控件独占一行:iOS 的原生 date 控件很宽,跟保存钮挤一行
                    会把后者压到换行,读起来像两个无关按钮。 */}
                <label className="flex w-full items-center gap-1.5 sm:w-auto">
                  <span className="shrink-0 text-white/80">{t('shotDate')}</span>
                  <input
                    type="date"
                    value={dateInput}
                    max={maxShotDate()}
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
                {/* 破坏性操作:手机上给足 44px 触达区,靠 ml-auto 推到最右。
                    关闭键在右上角,跟它隔着整张图。 */}
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
            )}
          </div>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-2 text-xs text-white" onClick={stop}>
          <Loader2 size={16} className="animate-spin" />
          <span>{tCommon('loading')}</span>
        </div>
      )}
    </div>
  )
}
