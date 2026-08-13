'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Package, Pencil, Trash2 } from 'lucide-react'
import Header from '@/components/layout/Header'
import ItemForm from '@/components/items/ItemForm'
import ItemDetail from '@/components/items/ItemDetail'
import Button from '@/components/ui/Button'
import { SearchInput, Select, Input } from '@/components/ui/Field'
import { Stat, StatBand } from '@/components/ui/Stat'
import SectionCard from '@/components/ui/SectionCard'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import LoadingState from '@/components/ui/LoadingState'
import EmptyState from '@/components/ui/EmptyState'
import { toneOf } from '@/lib/ui/status-tone'
import { ITEM_KINDS, ITEM_STATUSES, type Item, type ItemStatusLog } from '@/lib/items/types'
import { EMPTY_ITEM_FILTERS, itemFiltersToParams, type ItemFilters } from '@/lib/items/filter-types'
import type { Expense } from '@/lib/types'
import type { VenueLayout } from '@/venue/layoutData'

// 表格列数（编号/名称/类型/成本/位置/数量/状态/负责人/操作），三态提示行 colSpan 用。
const COL_COUNT = 9

export default function ItemsPage() {
  const t = useTranslations('items')
  const tCommon = useTranslations('common')
  const [items, setItems] = useState<Item[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [layout, setLayout] = useState<VenueLayout | null>(null)
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_ITEM_FILTERS)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [editingLogs, setEditingLogs] = useState<ItemStatusLog[]>([])
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<Item | null>(null)
  const [detailLogs, setDetailLogs] = useState<ItemStatusLog[]>([])

  // 成本与场地只拉一次（用于选择器与名称展示）
  useEffect(() => {
    ;(async () => {
      const exJson = await (await fetch('/api/expenses')).json()
      if (exJson?.data) setExpenses(exJson.data as Expense[])

      // 场地 API 为多场地：GET /api/venue → [{id,name}]；GET /api/venue?id= → 完整布局。
      // 拉全部场地的布局并合并楼层，供放置位置选择（楼层/区域 id 全局唯一，跨场地无冲突）。
      const listJson = await (await fetch('/api/venue')).json()
      const venues = (listJson?.data ?? []) as { id: string; name: string }[]
      const layouts = (
        await Promise.all(
          venues.map((v) =>
            fetch(`/api/venue?id=${encodeURIComponent(v.id)}`)
              .then((r) => r.json())
              .then((j) => (j?.data ?? null) as VenueLayout | null)
              .catch(() => null),
          ),
        )
      ).filter((l): l is VenueLayout => !!l)
      const multi = layouts.length > 1
      const mergedFloors = layouts.flatMap((lay) =>
        lay.floors.map((f) => ({ ...f, name: multi ? `${lay.name} · ${f.name}` : f.name })),
      )
      setLayout({ venueId: 'all', name: 'all', width: 0, height: 0, floors: mergedFloors })
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
  // Deliberately narrower than exhaustive-deps wants: `loadItems` is re-created
  // every render (plain function declaration), and `filters.floor_id` is applied
  // client-side below, so neither belongs here — listing them would refetch on
  // every render / every floor toggle. The five server-side fields are the
  // complete set that must trigger a refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadItems() }, [filters.q, filters.kind, filters.status, filters.venue_item_id, filters.responsible_person])

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
  const totalCost = useMemo(() =>
    visibleItems.reduce((sum, it) => {
      const ex = it.expense_id ? expenseById[it.expense_id] : null
      const assetValue = it.item_value != null ? it.item_value : (ex ? Number(ex.total_price) : 0)
      return sum + assetValue
    }, 0),
  [visibleItems, expenseById])
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

  // 点击编号/名称 → 只读详情（含状态时间线）
  async function openDetail(item: Item) {
    setDetailItem(item)
    setDetailLogs([])
    setDetailOpen(true)
    const res = await fetch(`/api/items/${item.id}`)
    const json = await res.json()
    const full = json?.data as (Item & { status_logs: ItemStatusLog[] }) | undefined
    setDetailLogs(full?.status_logs ?? [])
  }

  async function remove(item: Item) {
    if (!window.confirm(t('deletePrompt'))) return
    const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
    if (res.ok) loadItems()
  }

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        search={
          <div className="w-56">
            <SearchInput
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder={t('search')}
            />
          </div>
        }
        actions={
          <Button size="lg" onClick={openCreate}>
            <Plus className="w-4 h-4" /> {t('add')}
          </Button>
        }
      />

      {/* 统计 */}
      <StatBand>
        <Stat
          label={t('statTotalItems')}
          value={<>{visibleItems.length}<span className="text-xs font-normal text-ink-500 ml-1">{t('statItemUnit')}</span></>}
        />
        <Stat
          label={t('statTotalCost')}
          value={`¥${totalCost.toLocaleString('zh-CN')}`}
        />
      </StatBand>

      {/* 筛选 */}
      <div className="my-3 flex flex-wrap gap-2 sm:gap-3 bg-surface border border-line rounded-card p-3 sm:p-4">
        <Select
          value={filters.kind}
          onChange={(e) => setFilters({ ...filters, kind: e.target.value as ItemFilters['kind'] })}
          className="w-full sm:w-36"
        >
          <option value="">{t('colKind')}</option>
          {ITEM_KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
        </Select>
        <Select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="w-full sm:w-36"
        >
          <option value="">{t('colStatus')}</option>
          {ITEM_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
        <Select
          value={filters.floor_id}
          onChange={(e) => setFilters({ ...filters, floor_id: e.target.value })}
          className="w-full sm:w-40"
        >
          <option value="">{t('colPlacement')}</option>
          {(layout?.floors ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Input
          value={filters.responsible_person}
          onChange={(e) => setFilters({ ...filters, responsible_person: e.target.value })}
          placeholder={t('colResponsible')}
          className="w-full sm:w-36"
        />
      </div>

      {/* 表格 */}
      <SectionCard padding="none">
        <Table label={t('title')}>
          <THead>
            <Th>{t('colCode')}</Th>
            <Th>{t('colName')}</Th>
            <Th>{t('colKind')}</Th>
            <Th align="right">{t('colCost')}</Th>
            <Th>{t('colPlacement')}</Th>
            <Th align="right">{t('colQuantity')}</Th>
            <Th>{t('colStatus')}</Th>
            <Th>{t('colResponsible')}</Th>
            <Th />
          </THead>
          <TBody>
            {loading ? (
              <Tr><Td colSpan={COL_COUNT}><LoadingState variant="plain" /></Td></Tr>
            ) : visibleItems.length === 0 ? (
              <Tr><Td colSpan={COL_COUNT}><EmptyState icon={<Package />} title={t('empty')} /></Td></Tr>
            ) : visibleItems.map((it) => {
              const ex = it.expense_id ? expenseById[it.expense_id] : null
              const zone = it.placement_venue_item_id ? zoneById[it.placement_venue_item_id] : null
              return (
                <Tr key={it.id}>
                  <Td>
                    <button type="button" className="font-mono text-xs text-primary hover:underline" onClick={() => openDetail(it)}>
                      {it.item_code}
                    </button>
                  </Td>
                  <Td>
                    <button type="button" className="text-left text-ink-900 hover:text-primary-hover hover:underline" onClick={() => openDetail(it)}>
                      {it.name}
                    </button>
                  </Td>
                  <Td>{t(`kind.${it.kind}`)}</Td>
                  <Td align="right" numeric>
                    {ex ? (
                      <span>
                        ¥{(it.item_value != null ? it.item_value : Number(ex.total_price)).toLocaleString('zh-CN')}
                        {it.item_value != null && it.item_value < Number(ex.total_price) && (
                          <span className="ml-1 text-xs font-normal text-ink-400 line-through">¥{Number(ex.total_price).toLocaleString('zh-CN')}</span>
                        )}
                      </span>
                    ) : '—'}
                  </Td>
                  <Td>{zone ? `${zone.floor} · ${zone.zone}` : '—'}</Td>
                  <Td align="right" numeric>{it.quantity}</Td>
                  <Td><Tag size="sm" tone={toneOf('item', it.status)} label={t(`status.${it.status}`)} /></Td>
                  <Td>{it.responsible_person ?? '—'}</Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" aria-label={tCommon('edit')} title={tCommon('edit')} onClick={() => openEdit(it)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" aria-label={tCommon('delete')} title={tCommon('delete')} onClick={() => remove(it)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </SectionCard>

      <ItemForm
        open={formOpen}
        item={editing}
        statusLogs={editingLogs}
        expenses={expenses}
        layout={layout}
        onClose={() => setFormOpen(false)}
        onSaved={loadItems}
      />

      <ItemDetail
        open={detailOpen}
        item={detailItem}
        statusLogs={detailLogs}
        expenses={expenses}
        layout={layout}
        onClose={() => setDetailOpen(false)}
        onEdit={() => { if (detailItem) { setDetailOpen(false); openEdit(detailItem) } }}
      />
    </div>
  )
}
