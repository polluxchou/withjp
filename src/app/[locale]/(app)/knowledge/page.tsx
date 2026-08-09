'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import SectionCard from '@/components/ui/SectionCard'
import Tag from '@/components/ui/Tag'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import { CountChip } from '@/components/ui/FilterChip'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Plus, BookOpen, Trash2, Tag as TagIcon } from 'lucide-react'
import { useCurrentUser, canEdit } from '@/lib/auth/useCurrentUser'
import type { Knowledge, KnowledgeCategory } from '@/lib/types'

// Categories are plain labels, not a registered status enum (design-system.md
// §1.3) — no tone semantics to invent here, so every Tag/CountChip below uses
// a single consistent tone="neutral" rather than a per-category color map.
const CATEGORY_KEYS: KnowledgeCategory[] = [
  'outreach_scripts',
  'onboarding_materials',
  'live_strategies',
  'objection_handling',
]

export default function KnowledgePage() {
  const t = useTranslations('knowledge')
  const tCommon = useTranslations('common')
  const currentUser = useCurrentUser()
  const categoryLabel = (key: KnowledgeCategory) => t(`categories.${key}`)
  const [items,   setItems]   = useState<Knowledge[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<KnowledgeCategory | 'all'>('all')
  const [selected,setSelected]= useState<Knowledge | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ category: '' as KnowledgeCategory | '', title: '', content: '', tags: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter === 'all' ? '/api/knowledge' : `/api/knowledge?category=${filter}`
      const res  = await fetch(url)
      const json = await res.json()
      setItems(json.data ?? [])
    } catch (err) {
      console.error('Failed to load knowledge:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function deleteItem(id: string) {
    if (!confirm(t('deletePrompt'))) return
    await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE' })
    setSelected(null)
    load()
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: form.category,
        title:    form.title,
        content:  form.content,
        tags:     form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
      }),
    })
    setShowAdd(false)
    setForm({ category: '', title: '', content: '', tags: '' })
    load()
  }

  const grouped = CATEGORY_KEYS.reduce((acc, key) => {
    acc[key] = items.filter((i) => i.category === key)
    return acc
  }, {} as Record<KnowledgeCategory, Knowledge[]>)

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> {t('addEntry')}
          </Button>
        }
      />

      {/* Category filter — plain labels (not a status enum), so every chip
          shares one neutral tone; only the active/inactive state carries the
          visual distinction. */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <CountChip
          label={t('allFilter')}
          count={items.length}
          tone="neutral"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {CATEGORY_KEYS.map((key) => (
          <CountChip
            key={key}
            label={categoryLabel(key)}
            count={grouped[key]?.length ?? 0}
            tone="neutral"
            active={filter === key}
            onClick={() => setFilter(key)}
          />
        ))}
      </div>

      {loading ? (
        <LoadingState variant="list" />
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {/* Entry list — a SectionCard-wrapped selectable list rather than
              RecordRow: RecordRow's only click affordance is `href` (Link
              navigation), but this is a client-side master/detail selection
              with no per-item route, so RecordRow's contract doesn't fit
              without adding onClick/selected props to it (a breaking change
              to a shared component used across the app). SectionCard gives
              the same card chrome; each row stays a plain button styled with
              design tokens, mirroring Sidebar's active-item convention
              (bg-primary-soft, no invented border color). */}
          <div className="col-span-1">
            <SectionCard padding="none">
              {items.length === 0 ? (
                <EmptyState title={t('noEntries')} />
              ) : (
                <div className="p-2 space-y-1">
                  {items.map((item) => {
                    const isSelected = selected?.id === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelected(item)}
                        className={`w-full text-left rounded-field px-3 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-inset ${
                          isSelected ? 'bg-primary-soft' : 'hover:bg-line-soft'
                        }`}
                      >
                        <Tag size="sm" tone="neutral" label={categoryLabel(item.category)} />
                        <div className="text-sm font-medium text-ink-900 mt-1.5 line-clamp-2">{item.title}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Detail panel */}
          <div className="col-span-2">
            {!selected ? (
              <SectionCard>
                <EmptyState icon={<BookOpen />} title={t('selectEntry')} />
              </SectionCard>
            ) : (
              <SectionCard>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <Tag tone="neutral" label={categoryLabel(selected.category)} />
                    <h2 className="text-lg font-semibold text-ink-900 tracking-section mt-2">{selected.title}</h2>
                  </div>
                  {canEdit(currentUser, selected.created_by_user_id) && (
                    <Button variant="ghost" size="sm" aria-label={tCommon('delete')} title={tCommon('delete')} onClick={() => deleteItem(selected.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-danger-text" />
                    </Button>
                  )}
                </div>
                <div className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">
                  {selected.content}
                </div>
                {selected.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-line-soft flex-wrap">
                    <TagIcon className="w-3.5 h-3.5 text-ink-400" strokeWidth={1.5} />
                    {selected.tags.map((tag) => (
                      <Tag key={tag} size="sm" tone="neutral" label={tag} />
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {/* Add Entry Modal — form fields migrated to the shared Field/Input/
          Select/Textarea family. The zh/ja/en copy already bakes " *" into
          the required-field labels, so Field's own `required` prop (which
          would render a second asterisk) is left unset; the native `required`
          HTML attribute is still passed straight to the control for identical
          validation behavior. */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('addEntryModalTitle')} width="max-w-2xl">
        <form onSubmit={addItem} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('categoryField')}>
              <Select
                required
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as KnowledgeCategory }))}
              >
                <option value="">{t('categorySelect')}</option>
                {CATEGORY_KEYS.map((key) => <option key={key} value={key}>{categoryLabel(key)}</option>)}
              </Select>
            </Field>
            <Field label={t('tagsField')}>
              <Input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder={t('tagsPlaceholder')}
              />
            </Field>
          </div>
          <Field label={t('titleField')}>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('titlePlaceholder')}
            />
          </Field>
          <Field label={t('contentField')}>
            <Textarea
              required
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={8}
              placeholder={t('contentPlaceholder')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>{tCommon('cancel')}</Button>
            <Button type="submit">{t('addEntry')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
