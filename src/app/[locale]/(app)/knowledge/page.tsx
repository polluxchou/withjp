'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { Plus, Trash2, Tag } from 'lucide-react'
import { useCurrentUser, canEdit } from '@/lib/auth/useCurrentUser'
import type { Knowledge, KnowledgeCategory } from '@/lib/types'

const CATEGORY_KEYS: { key: KnowledgeCategory; color: 'blue' | 'purple' | 'green' | 'amber' }[] = [
  { key: 'outreach_scripts',     color: 'blue' },
  { key: 'onboarding_materials', color: 'purple' },
  { key: 'live_strategies',      color: 'green' },
  { key: 'objection_handling',   color: 'amber' },
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

  const grouped = CATEGORY_KEYS.reduce((acc, { key }) => {
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

      {/* Category filter */}
      <div className="flex items-center gap-1.5 mb-5">
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'all' ? 'bg-primary text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}>
          {t('allFilter')} ({items.length})
        </button>
        {CATEGORY_KEYS.map(({ key }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === key ? 'bg-primary text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}>
            {categoryLabel(key)} ({grouped[key]?.length ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-zinc-400">{t('loading')}</div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {/* Entry list */}
          <div className="col-span-1 space-y-2">
            {items.length === 0 && (
              <div className="bg-white border border-zinc-200 rounded-xl">
                <EmptyState emoji="📚" title={t('noEntries')} />
              </div>
            )}
            {items.map((item) => {
              const cat = CATEGORY_KEYS.find((c) => c.key === item.category)
              return (
                <button key={item.id} onClick={() => setSelected(item)}
                  className={`w-full text-left bg-white border rounded-xl p-3 hover:shadow-sm transition-all ${selected?.id === item.id ? 'border-violet-300 ring-2 ring-violet-100' : 'border-zinc-200'}`}>
                  <Badge label={categoryLabel(item.category)} color={cat?.color ?? 'slate'} size="sm" />
                  <div className="font-medium text-sm text-zinc-900 mt-1.5 line-clamp-2">{item.title}</div>
                </button>
              )
            })}
          </div>

          {/* Detail panel */}
          <div className="col-span-2">
            {!selected ? (
              <div className="bg-white border border-zinc-200 rounded-xl h-full flex items-center justify-center p-12">
                <div className="text-center">
                  <BookOpen className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">{t('selectEntry')}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Badge
                      label={categoryLabel(selected.category)}
                      color={CATEGORY_KEYS.find((c) => c.key === selected.category)?.color ?? 'slate'}
                    />
                    <h2 className="text-base font-semibold text-zinc-900 mt-2">{selected.title}</h2>
                  </div>
                  {canEdit(currentUser, selected.created_by_user_id) && (
                    <Button variant="ghost" size="sm" onClick={() => deleteItem(selected.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  )}
                </div>
                <div className="prose prose-sm max-w-none text-zinc-600 text-sm leading-relaxed whitespace-pre-wrap">
                  {selected.content}
                </div>
                {selected.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-zinc-100">
                    <Tag className="w-3.5 h-3.5 text-zinc-400" />
                    {selected.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded text-xs">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Entry Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('addEntryModalTitle')} width="max-w-2xl">
        <form onSubmit={addItem} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">{t('categoryField')}</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as KnowledgeCategory }))} required
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">{t('categorySelect')}</option>
                {CATEGORY_KEYS.map(({ key }) => <option key={key} value={key}>{categoryLabel(key)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">{t('tagsField')}</label>
              <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder={t('tagsPlaceholder')}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">{t('titleField')}</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required
              placeholder={t('titlePlaceholder')}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">{t('contentField')}</label>
            <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} required
              rows={8} placeholder={t('contentPlaceholder')}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>{tCommon('cancel')}</Button>
            <Button type="submit">{t('addEntry')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
