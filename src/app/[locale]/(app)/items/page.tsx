'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import Header from '@/components/layout/Header'
import ItemForm from '@/components/items/ItemForm'
import { ITEM_KINDS, ITEM_STATUSES, type Item, type ItemStatusLog } from '@/lib/items/types'
import { EMPTY_ITEM_FILTERS, itemFiltersToParams, type ItemFilters } from '@/lib/items/filter-types'
import type { Expense } from '@/lib/types'
import type { VenueLayout } from '@/venue/layoutData'

export default function ItemsPage() {
  const t = useTranslations('items')
  const [items, setItems] = useState<Item[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [layout, setLayout] = useState<VenueLayout | null>(null)
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_ITEM_FILTERS)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [editingLogs, setEditingLogs] = useState<ItemStatusLog[]>([])

  // 成本与场地只拉一次（用于选择器与名称展示）
  useEffect(() => {
    ;(async () => {
      const [exRes, venueRes] = await Promise.all([fetch('/api/expenses'), fetch('/api/venue')])
      const exJson = await exRes.json()
      const venueJson = await venueRes.json()
      if (exJson?.data) setExpenses(exJson.data as Expense[])
      if (venueJson?.data) setLayout(venueJson.data as VenueLayout)
    })()
  }, [])

  async function loadItems() {
    setLoading(true)
    const params = itemFiltersToParams(filters)
    const res = await fetch(`/api/items?${params.toString()}`)
    const json = await res.json()
    setItems((json?.data ?? []) as Item[])
    setLoading(false)
  }
  useEffect(() => { loadItems() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.q, filters.kind, filters.status, filters.venue_item_id, filters.responsible_person])

  // 客户端按楼层过滤（floor_id 不发给服务端）
  const zoneIdsByFloor = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const f of layout?.floors ?? []) map[f.id] = new Set(f.items.map((i) => i.id))
    return map
  }, [layout])
  const visibleItems = useMemo(() => {
    if (!filters.floor_id) return items
    const zoneSet = zoneIdsByFloor[filters.floor_id] ?? new Set()
    return items.filter((it) => it.placement_venue_item_id && zoneSet.has(it.placement_venue_item_id))
  }, [items, filters.floor_id, zoneIdsByFloor])

  // 名称查表
  const expenseById = useMemo(() => Object.fromEntries(expenses.map((e) => [e.id, e])), [expenses])
  const zoneById = useMemo(() => {
    const map: Record<string, { floor: string; zone: string }> = {}
    for (const f of layout?.floors ?? []) for (const z of f.items) map[z.id] = { floor: f.name, zone: z.name }
    return map
  }, [layout])

  async function openEdit(item: Item) {
    const res = await fetch(`/api/items/${item.id}`)
    const json = await res.json()
    const full = json?.data as (Item & { status_logs: ItemStatusLog[] }) | undefined
    setEditing(item)
    setEditingLogs(full?.status_logs ?? [])
    setFormOpen(true)
  }
  function openCreate() { setEditing(null); setEditingLogs([]); setFormOpen(true) }

  async function remove(item: Item) {
    if (!window.confirm(t('deletePrompt'))) return
    const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
    if (res.ok) loadItems()
  }

  return (
    <div>
      <Header title={t('title')} subtitle={t('subtitle')} actions={
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> {t('add')}
        </button>
      } />

      {/* 筛选 */}
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={filterCls + ' w-48'} placeholder={t('search')} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select className={filterCls} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as ItemFilters['kind'] })}>
          <option value="">{t('colKind')}</option>
          {ITEM_KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
        </select>
        <select className={filterCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">{t('colStatus')}</option>
          {ITEM_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        <select className={filterCls} value={filters.floor_id} onChange={(e) => setFilters({ ...filters, floor_id: e.target.value })}>
          <option value="">{t('colPlacement')}</option>
          {(layout?.floors ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input className={filterCls + ' w-36'} placeholder={t('colResponsible')} value={filters.responsible_person} onChange={(e) => setFilters({ ...filters, responsible_person: e.target.value })} />
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('colCode')}</th>
              <th className="px-3 py-2">{t('colName')}</th>
              <th className="px-3 py-2">{t('colKind')}</th>
              <th className="px-3 py-2">{t('colCost')}</th>
              <th className="px-3 py-2">{t('colPlacement')}</th>
              <th className="px-3 py-2">{t('colQuantity')}</th>
              <th className="px-3 py-2">{t('colStatus')}</th>
              <th className="px-3 py-2">{t('colResponsible')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">{t('loading')}</td></tr>
            ) : visibleItems.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">{t('empty')}</td></tr>
            ) : visibleItems.map((it) => {
              const ex = it.expense_id ? expenseById[it.expense_id] : null
              const zone = it.placement_venue_item_id ? zoneById[it.placement_venue_item_id] : null
              return (
                <tr key={it.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{it.item_code}</td>
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2">{t(`kind.${it.kind}`)}</td>
                  <td className="px-3 py-2">{ex ? `${ex.item_name} · ¥${ex.total_price}` : '—'}</td>
                  <td className="px-3 py-2">{zone ? `${zone.floor} · ${zone.zone}` : '—'}</td>
                  <td className="px-3 py-2">{it.quantity}</td>
                  <td className="px-3 py-2">{t(`status.${it.status}`)}</td>
                  <td className="px-3 py-2">{it.responsible_person ?? '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className="text-indigo-600 hover:underline mr-3" onClick={() => openEdit(it)}>编辑</button>
                    <button className="text-red-500 hover:underline" onClick={() => remove(it)}>删除</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ItemForm
        open={formOpen}
        item={editing}
        statusLogs={editingLogs}
        expenses={expenses}
        layout={layout}
        onClose={() => setFormOpen(false)}
        onSaved={loadItems}
      />
    </div>
  )
}

const filterCls = 'h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
