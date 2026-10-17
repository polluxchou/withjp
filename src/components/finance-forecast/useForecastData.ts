'use client'

import { useEffect, useRef, useState } from 'react'
import { mergeForecastDraft, type ForecastMonthInput } from '@/lib/finance-forecast/calculations'
import { createLatestSaveQueue } from '@/lib/finance-forecast/save-queue'
import { buildStorageKey, hasForecastInputs, readDraft, writeDraft } from '@/lib/finance-forecast/draft-storage'
import type { SaveStatus } from './types'

// 财务预测的数据层:按年份的月度输入(byYear)、本机草稿回填、700ms 防抖自动保存
// (每个视角 × 年份一条「只保留最新快照」的保存队列)、立即保存、切换视角时整体重载。
export function useForecastData({
  initialByYear,
  years,
  defaultViewId,
  activeViewId,
  canEditActive,
}: {
  initialByYear: Record<number, ForecastMonthInput[]>
  years:         number[]
  defaultViewId: string | null
  activeViewId:  string | null
  canEditActive: boolean
}) {
  const [byYear, setByYear] = useState<Record<number, ForecastMonthInput[]>>(initialByYear)
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [loadingView, setLoadingView] = useState(false)

  const didLoadDraft = useRef(false)
  const mountedRef   = useRef(false)
  const saveQueuesRef = useRef(new Map<string, ReturnType<typeof createLatestSaveQueue<ForecastMonthInput[]>>>())
  const prevByYearRef = useRef<Record<number, ForecastMonthInput[]>>(initialByYear)
  const prevViewIdRef = useRef<string | null>(defaultViewId)

  function getOrCreateQueue(viewId: string, year: number) {
    const key = `${viewId}:${year}`
    let queue = saveQueuesRef.current.get(key)
    if (queue) return queue
    queue = createLatestSaveQueue<ForecastMonthInput[]>(
      async (snapshot) => {
        const res = await fetch('/api/finance-forecast', {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ view_id: viewId, year, months: snapshot }),
        })
        if (!res.ok) throw new Error('Failed to save finance forecast')
      },
      (status) => {
        if (mountedRef.current) setSaveStatus(status)
      },
    )
    saveQueuesRef.current.set(key, queue)
    return queue
  }

  function setMonthsForYear(year: number, updater: (prev: ForecastMonthInput[]) => ForecastMonthInput[]) {
    setByYear((prev) => ({ ...prev, [year]: updater(prev[year] ?? []) }))
  }

  // 删行/清空这类破坏性操作不等防抖,立刻写草稿并入队保存。
  function persistImmediate(year: number, newMonths: ForecastMonthInput[]) {
    if (!activeViewId || !canEditActive) return
    setByYear((prev) => ({ ...prev, [year]: newMonths }))
    writeDraft(buildStorageKey(activeViewId, year), newMonths)
    prevByYearRef.current = { ...prevByYearRef.current, [year]: newMonths }
    getOrCreateQueue(activeViewId, year).enqueue(newMonths)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!activeViewId) return
    if (didLoadDraft.current && prevViewIdRef.current === activeViewId) return
    didLoadDraft.current = true
    prevViewIdRef.current = activeViewId

    setByYear((current) => {
      const next = { ...current }
      for (const year of years) {
        const draft = readDraft(buildStorageKey(activeViewId, year))
        if (!draft) continue
        const existing = next[year] ?? []
        if (hasForecastInputs(existing)) continue
        next[year] = mergeForecastDraft(existing, draft)
      }
      prevByYearRef.current = next
      return next
    })
    setHydratedDraft(true)
  }, [activeViewId, years])

  useEffect(() => {
    if (!hydratedDraft) return
    if (!activeViewId || !canEditActive) return

    const anySaving = Array.from(saveQueuesRef.current.values()).some((q) => q.isSaving())
    if (!anySaving) setSaveStatus('idle')

    const timers: number[] = []
    const prev = prevByYearRef.current
    const viewId = activeViewId
    for (const year of years) {
      const cur = byYear[year]
      if (!cur || cur === prev[year]) continue
      writeDraft(buildStorageKey(viewId, year), cur)
      const timer = window.setTimeout(() => {
        getOrCreateQueue(viewId, year).enqueue(cur)
      }, 700)
      timers.push(timer)
    }
    prevByYearRef.current = byYear

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [hydratedDraft, byYear, years, activeViewId, canEditActive])

  async function fetchViewForecast(viewId: string) {
    setLoadingView(true)
    try {
      const yearsParam = years.join(',')
      const res = await fetch(`/api/finance-forecast?view_id=${viewId}&years=${yearsParam}`)
      if (!res.ok) {
        console.error('Failed to load view', viewId, await res.text())
        setSaveStatus('error')
        return
      }
      const body = await res.json() as { data: Record<number, ForecastMonthInput[]> | null }
      if (body.data) {
        const next: Record<number, ForecastMonthInput[]> = {}
        for (const year of years) next[year] = body.data[year] ?? []
        didLoadDraft.current = false
        prevViewIdRef.current = viewId
        prevByYearRef.current = next
        setByYear(next)
        setHydratedDraft(true)
      }
    } catch (e) {
      console.error('Failed to load view forecast', viewId, e)
      setSaveStatus('error')
    } finally {
      setLoadingView(false)
    }
  }

  return { byYear, setByYear, setMonthsForYear, persistImmediate, fetchViewForecast, saveStatus, loadingView }
}
