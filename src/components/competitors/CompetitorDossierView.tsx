// src/components/competitors/CompetitorDossierView.tsx
'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import CompetitorCard from './CompetitorCard'
import CompetitorNavBar from './CompetitorNavBar'
import CompetitorSummaryBar from './CompetitorSummaryBar'
import ShotDateStrip from './ShotDateStrip'
import { todayLocal } from '@/lib/competitors/localDate'
import { SHOT_WINDOW_SIZE, collectShotDates, missesShotOn, resolveAnchor, windowOf } from '@/lib/competitors/shotGrid'
import { competitorName, summarizeBoard } from '@/lib/competitors/summary'
import type { CompetitorBoard } from '@/lib/competitors/types'
import Button from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'


export default function CompetitorDossierView({ initial }: { initial: CompetitorBoard }) {
  const t = useTranslations('competitors')
  const [board, setBoard] = useState<CompetitorBoard>(initial)
  const [input, setInput] = useState('')
  const [addType, setAddType] = useState<'group' | 'streamer'>('group')
  const [addParentId, setAddParentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 整页共用的截图日期轴：所有竞品(含子主播)有图日期的并集
  const [anchorDate, setAnchorDate] = useState<string | null>(null)
  const shotAxis = useMemo(() => collectShotDates(board.competitors), [board.competitors])
  const selectedDate = useMemo(() => resolveAnchor(shotAxis, anchorDate), [shotAxis, anchorDate])
  const dateWindow = useMemo(
    () => windowOf(shotAxis, selectedDate ? shotAxis.indexOf(selectedDate) : -1, SHOT_WINDOW_SIZE),
    [shotAxis, selectedDate],
  )

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
      missingShot: missesShotOn(c.shots, selectedDate),
    })),
    [board.competitors, selectedDate],
  )

  // 选中态常驻,不再是"跳过去闪一下"的临时高亮:芯片和卡片共用这一个 id,
  // 滚了半天也能一眼看出自己停在哪个号上。换一个号才让上一个熄灭。
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/competitors', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      const json = await res.json()
      if (json.data) setBoard(json.data as CompetitorBoard)
    } catch {
      setError(t('actionFailed'))
    }
  }, [t])

  const add = useCallback(() => {
    const value = input.trim()
    if (!value) return
    setError(null)
    const body: { url: string; parent_id?: string } = { url: value }
    if (addType === 'streamer' && addParentId) body.parent_id = addParentId
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
        await refresh()
      } catch {
        setError(t('addFailed'))
      }
    })
  }, [input, addType, addParentId, refresh, t])

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
    <div className="space-y-4">
      {board.canEdit && (
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder={t('addPlaceholder')}
            className="flex-1"
          />
          <Select
            value={addType}
            onChange={(e) => { setAddType(e.target.value as 'group' | 'streamer'); setAddParentId('') }}
          >
            <option value="group">{t('independent')}</option>
            <option value="streamer">{t('roleStreamer')}</option>
          </Select>
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
              data-sticky-head 是给导航条量高度用的锚点偏移量来源,见 CompetitorNavBar。*/}
          <div data-sticky-head className="sticky top-0 z-10 bg-atmosphere pt-2">
            <CompetitorNavBar targets={navTargets} selectedId={selectedId} onJump={setSelectedId} />
            <ShotDateStrip
              axis={shotAxis}
              dateWindow={dateWindow}
              selectedDate={selectedDate}
              onPick={setAnchorDate}
            />
          </div>
          {board.competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              c={c}
              canEdit={board.canEdit}
              onChanged={refresh}
              onDeleteId={remove}
              parentOptions={parentOptions}
              onAssignParent={assignParent}
              onUpdateHandle={updateHandle}
              dateWindow={dateWindow}
              selectedDate={selectedDate}
              regionPeers={board.competitors}
              selected={c.id === selectedId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
