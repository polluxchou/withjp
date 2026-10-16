'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslations } from 'next-intl'
import type { ForecastMonthInput } from '@/lib/finance-forecast/calculations'
import type { ForecastView } from '@/lib/finance-forecast/views'

// 视角栏的增删改切换。切到/新建视角时由 onOpenView 把年月选择复位,再整体重载数据。
export function useForecastViewActions({
  setViews,
  activeViewId,
  setActiveViewId,
  currentUserId,
  years,
  fetchViewForecast,
  setByYear,
  onOpenView,
}: {
  setViews:          Dispatch<SetStateAction<ForecastView[]>>
  activeViewId:      string | null
  setActiveViewId:   Dispatch<SetStateAction<string | null>>
  currentUserId:     string
  years:             number[]
  fetchViewForecast: (viewId: string) => Promise<void>
  setByYear:         Dispatch<SetStateAction<Record<number, ForecastMonthInput[]>>>
  onOpenView:        () => void
}) {
  const t = useTranslations('financeForecast')
  const [viewBarBusy, setViewBarBusy] = useState(false)

  async function handleSelectView(viewId: string) {
    if (viewId === activeViewId) return
    setActiveViewId(viewId)
    onOpenView()
    await fetchViewForecast(viewId)
  }

  async function handleCreateView(input: { name: string; note: string }) {
    setViewBarBusy(true)
    try {
      const res = await fetch('/api/finance-forecast/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(input),
      })
      const body = await res.json() as { data: ForecastView | null; error: string | null }
      if (!res.ok || !body.data) throw new Error(body.error ?? 'Failed to create view')
      const newView = body.data
      setViews((prev) => [...prev, newView])
      setActiveViewId(newView.id)
      onOpenView()
      await fetchViewForecast(newView.id)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('alertCreateFailed'))
    } finally {
      setViewBarBusy(false)
    }
  }

  async function handleUpdateView(
    id: string,
    patch: { name?: string; note?: string; is_public?: boolean },
  ) {
    setViewBarBusy(true)
    try {
      const res = await fetch(`/api/finance-forecast/views/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const body = await res.json() as { data: ForecastView | null; error: string | null }
      if (!res.ok || !body.data) throw new Error(body.error ?? 'Failed to update view')
      const updated = body.data
      setViews((prev) => prev.map((v) => v.id === id ? updated : v))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('alertUpdateFailed'))
    } finally {
      setViewBarBusy(false)
    }
  }

  async function handleDeleteView(id: string) {
    setViewBarBusy(true)
    try {
      const res = await fetch(`/api/finance-forecast/views/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to delete view')
      }
      setViews((prev) => {
        const next = prev.filter((v) => v.id !== id)
        if (id === activeViewId) {
          const fallback = next.find((v) => v.owner_id === currentUserId) ?? next[0] ?? null
          setActiveViewId(fallback?.id ?? null)
          if (fallback) void fetchViewForecast(fallback.id)
          else {
            const empty: Record<number, ForecastMonthInput[]> = {}
            for (const year of years) empty[year] = []
            setByYear(empty)
          }
        }
        return next
      })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('alertDeleteFailed'))
    } finally {
      setViewBarBusy(false)
    }
  }

  return { viewBarBusy, handleSelectView, handleCreateView, handleUpdateView, handleDeleteView }
}
