// src/components/competitors/CompetitorDossierView.tsx
'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Plus } from 'lucide-react'
import CompetitorCard from './CompetitorCard'
import CompetitorNavBar from './CompetitorNavBar'
import CompetitorSummaryBar from './CompetitorSummaryBar'
import ShotDateStrip from './ShotDateStrip'
import { todayLocal } from '@/lib/competitors/localDate'
import { competitorAnchorId, competitorIdFromHash } from '@/lib/competitors/anchors'
import { scrollToCompetitorCard } from './scrollToCard'
import { SHOT_WINDOW_SIZE, UNDATED_KEY, missesShotOn, resolveAnchor, windowOf } from '@/lib/competitors/shotGrid'
import { boardRefreshPath, isShotDateLoaded, mergeShotRange, nextChunk, refreshSince, windowHasUnloaded } from '@/lib/competitors/shotWindow'
import { createChunkLoader, fetchShotRange } from '@/lib/competitors/chunkLoader'
import { patrolDaysOf } from '@/lib/competitors/liveCoverage'
import { competitorName, summarizeBoard } from '@/lib/competitors/summary'
import { REGION_CODES } from '@/lib/competitors/regions'
import type { CompetitorBoard, CompetitorShot } from '@/lib/competitors/types'
import Button from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'


export default function CompetitorDossierView({ initial }: { initial: CompetitorBoard }) {
  const t = useTranslations('competitors')
  const tCommon = useTranslations('common')
  const [board, setBoard] = useState<CompetitorBoard>(initial)
  const [input, setInput] = useState('')
  const [addType, setAddType] = useState<'group' | 'streamer'>('group')
  const [addParentId, setAddParentId] = useState('')
  // 主账号必须选地区（数据库不再默认 JP）；主播沿用所属团，不显示这一项。
  const [addRegion, setAddRegion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 整页共用的截图日期轴：服务端下发的完整轴（全部有图日期），不从已加载的截图里拼——
  // 截图只加载了最近一段，从它拼出来的轴会让「更早」键以为历史到头了。
  const [anchorDate, setAnchorDate] = useState<string | null>(null)
  const shotAxis = board.shotAxis
  const selectedDate = useMemo(() => resolveAnchor(shotAxis, anchorDate), [shotAxis, anchorDate])
  const dateWindow = useMemo(
    () => windowOf(shotAxis, selectedDate ? shotAxis.indexOf(selectedDate) : -1, SHOT_WINDOW_SIZE),
    [shotAxis, selectedDate],
  )
  // 巡检日 = 全库（含子主播）任意截图的 shot_on，正是上面日期轴的那些日子。某号那天没截图、
  // 别的号有，说明巡检跑过、它没在播；全库都没截图的日子对只有截图的号是「无数据」，不是没播。
  // shot_on 按日区业务日（JST）落库，口径见 lib/competitors/liveCoverage.ts。
  // board.shotAxis 是全量日期轴（服务端瘦查询算的），不随相册已加载到哪一天变。
  const patrolDays = useMemo(() => patrolDaysOf(shotAxis.filter((d) => d !== UNDATED_KEY)), [shotAxis])

  // 顶层竞品可作为父账号选项。
  const parentOptions = useMemo(
    () => board.competitors.map((c) => ({ id: c.id, label: competitorName(c) })),
    [board.competitors],
  )

  // today 要读时钟：服务端(UTC)和浏览器(UTC+8/+9)会算出不同的日期，直接在
  // 渲染期取会让统计条的文本 hydration 不一致。挂载后再取，首帧不渲染统计条。
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => { setToday(todayLocal()) }, [])
  // 统计与导航都只覆盖顶层主竞品：子主播是父卡内部的下钻内容，
  // 混进总量会让"追踪了几家"这个数字失去意义。
  const summary = useMemo(
    () => (today ? summarizeBoard(board.competitors, today) : null),
    [board.competitors, today],
  )
  // missingShot 跟的是**日期轴上当前选中的那天**（默认落在有图的最新一天，
  // 日常扫播时就是今天），不是系统今天：轴上只有有图的日期，若某天全员无图
  // 那天根本不在轴上，拿系统今天去比会得出"全员待补"这种没信息量的结果。
  const navTargets = useMemo(
    () => board.competitors.map((c) => ({
      id: c.id,
      name: competitorName(c),
      handle: c.handle,
      region: c.region,
      // 选中日还没加载时一律不标：那天的截图还没取回来，不等于没图。
      missingShot: isShotDateLoaded(selectedDate, board.shotsLoadedFrom) && missesShotOn(c.shots, selectedDate),
    })),
    [board.competitors, board.shotsLoadedFrom, selectedDate],
  )

  // 选中态常驻,不再是"跳过去闪一下"的临时高亮:芯片和卡片共用这一个 id,
  // 滚了半天也能一眼看出自己停在哪个号上。换一个号才让上一个熄灭。
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 竞品公司页的「查看档案」带着 #competitor-<id> 跳进来。浏览器原生的锚点跳转把卡片
  // 顶边对齐到视口顶，正好被吸顶块盖住头部，所以挂载后按导航条同一套算法重新落点，
  // 并点亮对应芯片。等 today 就位再量：统计条在那之后才出现，会把整块往下推一截。
  // 之后再复核两次（框架自己的 hash 滚动、晚到的字体都可能在第一次之后再挪一下），
  // 但只要用户已经动了滚轮/触摸/键盘就不再抢回来。
  // 吸顶块的实测高度写进 CSS 变量，竞品卡的 scroll-margin-top 读它（见 CompetitorCard）。
  // 用 ResizeObserver 跟着变：导航条换行、日期轴列数、统计条晚出现都会改它的高度。
  // 必须是 useLayoutEffect：从竞品公司页客户端跳进来时，Next 的锚点滚动（scrollIntoView）
  // 在路由段的 componentDidMount 里执行，早于本组件的 useEffect；React 先跑子组件的
  // layout effect 再跑父级的 didMount，只有这样变量才赶得上那一次滚动。
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    const head = root?.querySelector<HTMLElement>('[data-sticky-head]')
    if (!root || !head) return
    const sync = () => root.style.setProperty('--competitor-sticky-head', `${Math.round(head.getBoundingClientRect().height)}px`)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(head)
    return () => ro.disconnect()
  }, [board.competitors.length])

  useEffect(() => {
    if (today === null) return
    let userMoved = false
    const markMoved = () => { userMoved = true }
    const timers: ReturnType<typeof setTimeout>[] = []
    const go = () => {
      const id = competitorIdFromHash(window.location.hash)
      if (!id || !document.getElementById(competitorAnchorId(id))) return
      setSelectedId(id)
      userMoved = false
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scrollToCompetitorCard(id, false)
        for (const ms of [150, 450]) {
          timers.push(setTimeout(() => { if (!userMoved) scrollToCompetitorCard(id, false) }, ms))
        }
      }))
    }
    const opts = { passive: true } as const
    window.addEventListener('wheel', markMoved, opts)
    window.addEventListener('touchstart', markMoved, opts)
    window.addEventListener('keydown', markMoved)
    window.addEventListener('hashchange', go)
    go()
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('wheel', markMoved)
      window.removeEventListener('touchstart', markMoved)
      window.removeEventListener('keydown', markMoved)
      window.removeEventListener('hashchange', go)
    }
  }, [today])

  // 往历史翻页时按需补取截图。判据全在 shotWindow.ts：nextChunk 决定补哪段，
  // mergeShotRange 合并并丢弃过期结果（请求飞行期间看板被刷新换掉的情况）；
  // 去重、同右端排队、失败、重试、被取代的异步状态机在 chunkLoader.ts（有行为测试），这里只接线。
  // 不在 effect 清理里取消请求：dev 的 StrictMode 双挂载会把在途请求取消掉、又被去重挡住重发，
  // 永远卡在占位格；靠去重 + 过期丢弃就够了。
  // pendingChunk 的依赖必须带 board.shotsLoadedFrom：排队的缺口在在途段成功后不会自动补发，
  // 靠合并推进起点 → 这里重算 → 再 want 一次续上。
  const [shotLoadFailed, setShotLoadFailed] = useState(false)
  const [loader] = useState(() => createChunkLoader<CompetitorShot>({
    fetchRows: (range) => fetchShotRange<CompetitorShot>(range),
    merge: (rows, range) => setBoard((b) => mergeShotRange(b, rows, range)),
    setFailed: setShotLoadFailed,
  }))
  const pendingChunk = useMemo(
    () => nextChunk(shotAxis, dateWindow, board.shotsLoadedFrom),
    [shotAxis, dateWindow, board.shotsLoadedFrom],
  )
  useEffect(() => { loader.want(pendingChunk) }, [loader, pendingChunk])
  // 失败提示放进吸顶的日期轴（lg 起）、吸顶块正下方那一行（lg 以下）和占位格本身（各宽度），
  // 不放页面顶部：用户多半是滚到中部、用吸顶日期轴翻页的，顶部那行既看不到也够不着。
  // 只在当前屏真有占位格时挂出，判据见 windowHasUnloaded。
  const shotRetryHint = shotLoadFailed && windowHasUnloaded(dateWindow, board.shotsLoadedFrom)
  const retryShots = useCallback(() => loader.retry(), [loader])

  // refresh 是 useCallback，闭包里的 board 会过期；since 走 ref 读最新值。
  // 起点为 null（已翻到轴首、全部已加载）时也要带上轴首那一天：不带的话服务端缺省回最近一段，
  // 刷新会把已加载的全部历史缩回去；带轴首服务端会归一回 null（全部）。判据见 refreshSince。
  const refreshSinceRef = useRef(refreshSince(board.shotsLoadedFrom, board.shotAxis))
  useEffect(() => { refreshSinceRef.current = refreshSince(board.shotsLoadedFrom, board.shotAxis) }, [board.shotsLoadedFrom, board.shotAxis])

  // 重新取一遍看板，失败就抛。开播记录弹窗导入后要拿它判断「数据是不是最新的」，所以单独留出一个会抛的版本。
  // 带上已加载起点：翻到历史后上传/改日期/删图/导入再刷新，不会被缩回首屏那两屏。
  const loadBoard = useCallback(async () => {
    const res = await fetch(boardRefreshPath(refreshSinceRef.current), { cache: 'no-store' })
    if (!res.ok) throw new Error('load failed')
    const json = await res.json()
    if (json.data) setBoard(json.data as CompetitorBoard)
  }, [])

  // 页面自己的各个操作与卡片内的保存（上传、备注…）用这个：失败只置错误条、不抛——
  // 卡片里大多是不 await 的调用，抛出来就成了未处理的 rejection。
  const refresh = useCallback(async () => {
    try {
      await loadBoard()
    } catch {
      setError(t('actionFailed'))
    }
  }, [loadBoard, t])

  const add = useCallback(() => {
    const value = input.trim()
    if (!value) return
    if (addType === 'group' && !addRegion) { setError(t('regionRequired')); return }
    setError(null)
    const body: { url: string; parent_id?: string; region?: string } = { url: value }
    if (addType === 'streamer' && addParentId) body.parent_id = addParentId
    if (addType === 'group') body.region = addRegion
    startTransition(async () => {
      try {
        const res = await fetch('/api/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({ error: 'parse' }))
        if (!res.ok || json.error) { setError(t('addFailed')); return }
        setInput('')
        setAddType('group')
        setAddParentId('')
        setAddRegion('')
        await refresh()
      } catch {
        setError(t('addFailed'))
      }
    })
  }, [input, addType, addParentId, addRegion, refresh, t])

  const remove = useCallback((id: string) => {
    if (!confirm(t('deleteConfirm'))) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, { method: 'DELETE' })
        if (!res.ok) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  const assignParent = useCallback((id: string, parentId: string | null) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId }),
        })
        if (!res.ok) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  const updateRegion = useCallback((id: string, region: string) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ region }),
        })
        const json = await res.json().catch(() => ({ error: 'parse' }))
        if (!res.ok || json.error) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  const updateHandle = useCallback((id: string, raw: string) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/competitors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: raw }),
        })
        const json = await res.json().catch(() => ({ error: 'parse' }))
        if (!res.ok || json.error) { setError(t('actionFailed')); return }
        await refresh()
      } catch {
        setError(t('actionFailed'))
      }
    })
  }, [refresh, t])

  return (
    <div ref={rootRef} className="space-y-4">
      {board.canEdit && (
        // 多了地区下拉后一行四个控件，375px 宽时输入框被挤到 26px：窄屏让输入框独占
        // 第一行，下拉和按钮换到第二行；桌面放得下，flex-wrap 不会换行。
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={t('addPlaceholder')}
            className="flex-1 max-md:basis-full"
          />
          <Select
            value={addType}
            onChange={(e) => { setAddType(e.target.value as 'group' | 'streamer'); setAddParentId('') }}
          >
            <option value="group">{t('independent')}</option>
            <option value="streamer">{t('roleStreamer')}</option>
          </Select>
          {addType === 'group' && (
            <Select
              value={addRegion}
              onChange={(e) => setAddRegion(e.target.value)}
              aria-label={t('region')}
            >
              <option value="">{t('selectRegion')}</option>
              {REGION_CODES.map((code) => (
                <option key={code} value={code}>{t(`regionName.${code}`)}</option>
              ))}
            </Select>
          )}
          {addType === 'streamer' && (
            <Select
              value={addParentId}
              onChange={(e) => setAddParentId(e.target.value)}
            >
              <option value="">{t('selectGroup')}</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          )}
          <Button onClick={add} loading={pending}>
            {pending
              ? t('addButton')
              : <><Plus size={16} strokeWidth={1.5} /> {t('addButton')}</>}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-danger-text">{error}</p>}

      {board.competitors.length === 0 ? (
        <p className="text-sm text-ink-500">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {summary && <CompetitorSummaryBar summary={summary} />}
          {/* 账号导航条与日期轴合成一整块吸顶:
              - 导航条常驻,才能连着跳好几个账号而不用每次滚回顶部;
              - 日期轴本来就必须吸顶(格子里不显示日期文字,滚走了就没法对应列);
              - 两者各自 sticky top-0 会重叠,所以吸顶提到这一层统一做。
              不透明底色必须在这层:否则卡片会从吸顶块底下穿过去。
              data-sticky-head 是给导航条量高度用的锚点偏移量来源,见 CompetitorNavBar。

              这里刻意不加 transform / will-change,别再往回加。下面复述那个类名时也
              刻意不写 Tailwind 的方括号任意属性形式:JIT 扫的是源码文本、不分注释与 JSX,
              照原样写会把这条规则重新生成进产物 CSS(已实测在线上 CSS 里躺着一条没人用的
              transform: translateZ(0))。

              PR 280 曾加过一个 transform: translateZ(0) 的工具类,想靠「强制提升独立合成层」绕过
              iOS 上「这两行偶尔跟着内容滚走、过一会儿自己归位」的毛病。真机结论是
              那条假设错了,而且换来一个更糟的失效方式:iOS(WKWebView,含 iOS Chrome)
              上平白下滑就会把整块定在错误的偏移上,只有最后一行日期露在视口里,
              搜索框和账号芯片整行都看不见 —— 从「偶尔、会自己好」变成「一直、不会好」。

              解释得通:合成层由滚动线程按**布局时算好的**吸顶约束定位,而这一块在首帧
              之后还会挪位——统计条要等挂载后才出现(见上方 today 的注释),它一冒出来
              整块就往下移一截。约束一旦过期,滚动线程不会自己纠正;不提升合成层时
              每次滚动都走主线程重新算,反而不会错。

              如果「偶尔脱顶」再现,下一步是逐个收拾扰动源(芯片行的 rAF 横滚、jump 里
              连发的两次 scrollTo、灯箱/抽屉的 lockViewportScroll),而不是再提合成层。*/}
          <div data-sticky-head className="sticky top-0 z-10 bg-atmosphere pt-2">
            <CompetitorNavBar targets={navTargets} selectedId={selectedId} onJump={setSelectedId} />
            <ShotDateStrip
              axis={shotAxis}
              dateWindow={dateWindow}
              selectedDate={selectedDate}
              onPick={setAnchorDate}
              loadFailed={shotRetryHint}
              onRetry={retryShots}
            />
          </div>
          {/* 窄屏的补取失败提示。日期轴那一行窄屏没有空位(见 ShotDateStrip),而停在页面顶部时
              第一张卡的相册在首屏之下,只靠占位格的话首屏看不到失败。
              放在吸顶块**下方**、不吸顶:停在顶部时它就在日期行下面;滚到中部时它已滚出视口,
              由占位格上的重试接手。不放进吸顶块(会加高吸顶区),也不放在吸顶块上方
              (会把吸顶块连同正要再点的「更早」键挤下去,也是上面长注释里说的挪位扰动源)。 */}
          {shotRetryHint && (
            <p role="alert" className="flex items-center gap-2 px-4 text-sm text-danger-text lg:hidden">
              <AlertTriangle size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
              {t('shotsLoadFailed')}
              <Button variant="secondary" size="sm" onClick={retryShots}>
                {tCommon('retry')}
              </Button>
            </p>
          )}
          {board.competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              c={c}
              canEdit={board.canEdit}
              onChanged={refresh}
              onReload={loadBoard}
              onDeleteId={remove}
              parentOptions={parentOptions}
              onAssignParent={assignParent}
              onUpdateHandle={updateHandle}
              onUpdateRegion={updateRegion}
              dateWindow={dateWindow}
              selectedDate={selectedDate}
              shotsLoadedFrom={board.shotsLoadedFrom}
              shotLoadFailed={shotLoadFailed}
              onRetryShots={retryShots}
              regionPeers={board.competitors}
              patrolDays={patrolDays}
              selected={c.id === selectedId}
              today={today}
            />
          ))}
        </div>
      )}
    </div>
  )
}
