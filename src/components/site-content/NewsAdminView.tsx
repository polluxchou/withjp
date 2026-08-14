'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, Pin, PinOff, Eye, EyeOff, ExternalLink, Newspaper } from 'lucide-react'
import Header from '@/components/layout/Header'
import SectionCard from '@/components/ui/SectionCard'
import RecordRow from '@/components/ui/RecordRow'
import { Stat, StatBand } from '@/components/ui/Stat'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import NewsForm from './NewsForm'
import type { NewsRow } from '@/lib/site/news-service.ts'
import { PUBLIC_SITE_HOST } from '@/lib/site/domain-routing.ts'

const NEWS_ENDPOINT = '/api/site/news'

// 官网直达链接：日文是默认语言，走无前缀路径（domain-routing.ts 的
// cleanPublicPath 对默认 locale 不加前缀）。后台只需要一个入口，语言可以在
// 官网自己切换。
function publicNewsUrl(slug: string): string {
  return `https://${PUBLIC_SITE_HOST}/news/${slug}`
}

type ViewMode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; row: NewsRow }

export default function NewsAdminView({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('siteNews')
  const tCommon = useTranslations('common')

  const [rows, setRows] = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState<ViewMode>({ kind: 'list' })
  const [deleteTarget, setDeleteTarget] = useState<NewsRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(NEWS_ENDPOINT)
      const json = (await res.json()) as { data?: NewsRow[]; error?: string }
      if (!res.ok) { setLoadError(true); return }
      setRows(json.data ?? [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleField(row: NewsRow, patch: Partial<Pick<NewsRow, 'is_pinned' | 'is_published'>>) {
    setToggling(row.id)
    try {
      const res = await fetch(`${NEWS_ENDPOINT}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) await load()
    } finally {
      setToggling(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${NEWS_ENDPOINT}/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTarget(null)
        await load()
      }
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaved() {
    setView({ kind: 'list' })
    await load()
  }

  const published = rows.filter((r) => r.is_published).length
  const unpublished = rows.length - published

  if (view.kind === 'create' || view.kind === 'edit') {
    const editing = view.kind === 'edit' ? view.row : null
    return (
      <div>
        <Header title={editing ? t('editTitle') : t('addTitle')} subtitle={t('formSubtitle')} />
        <NewsForm
          row={editing}
          onCancel={() => setView({ kind: 'list' })}
          onSaved={handleSaved}
        />
      </div>
    )
  }

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          isAdmin ? (
            <Button size="lg" onClick={() => setView({ kind: 'create' })}>
              <Plus className="w-4 h-4" /> {t('add')}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState variant="stats" />
      ) : (
        <div className="mb-4">
          <StatBand>
            <Stat label={t('statTotal')} value={rows.length} />
            <Stat label={t('statPublished')} value={published} />
            <Stat label={t('statUnpublished')} value={unpublished} />
          </StatBand>
        </div>
      )}

      <SectionCard padding="none" icon={<Newspaper />} title={t('listTitle')}>
        {loading ? (
          <LoadingState variant="list" />
        ) : loadError ? (
          <ErrorState detail={tCommon('loadFailed')} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('empty')}
            hint={t('emptyHint')}
            action={isAdmin ? <Button size="sm" onClick={() => setView({ kind: 'create' })}>{t('add')}</Button> : undefined}
          />
        ) : (
          <div>
            {rows.map((row) => (
              <div key={row.id} className={row.is_published ? undefined : 'opacity-60'}>
                <RecordRow
                  status={row.is_published ? 'success' : 'danger'}
                  title={row.title_ja}
                  meta={[
                    { text: row.published_on, mono: true },
                    { text: t(`category.${row.category}`) },
                    { text: t(`tag.${row.tag}`) },
                  ]}
                  tags={
                    <div className="flex items-center gap-1.5 flex-none">
                      {row.is_pinned && <Tag size="sm" tone="violet" label={t('pinnedTag')} />}
                      {!row.is_published && <Tag size="sm" tone="danger" label={t('unpublishedTag')} />}
                    </div>
                  }
                  actions={
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('viewOnSite')}
                        title={t('viewOnSite')}
                        onClick={() => window.open(publicNewsUrl(row.slug), '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggling === row.id}
                            aria-label={row.is_pinned ? t('actionUnpin') : t('actionPin')}
                            title={row.is_pinned ? t('actionUnpin') : t('actionPin')}
                            onClick={() => toggleField(row, { is_pinned: !row.is_pinned })}
                          >
                            {row.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={toggling === row.id}
                            aria-label={row.is_published ? t('actionUnpublish') : t('actionPublish')}
                            title={row.is_published ? t('actionUnpublish') : t('actionPublish')}
                            onClick={() => toggleField(row, { is_published: !row.is_published })}
                          >
                            {row.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={tCommon('edit')}
                            title={tCommon('edit')}
                            onClick={() => setView({ kind: 'edit', row })}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={tCommon('delete')}
                            title={tCommon('delete')}
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('deleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {tCommon('cancel')}
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              {tCommon('delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">{t('deleteWarning', { title: deleteTarget?.title_ja ?? '' })}</p>
      </Modal>
    </div>
  )
}
