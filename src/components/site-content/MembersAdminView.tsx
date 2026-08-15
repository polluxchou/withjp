'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Pencil, ImageOff, ExternalLink, Users, Plus, Trash2 } from 'lucide-react'
import Header from '@/components/layout/Header'
import SectionCard from '@/components/ui/SectionCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import MemberEditForm from './MemberEditForm'
import MemberCreateForm from './MemberCreateForm'
import type { MemberRow } from '@/lib/site/members-service.ts'
import { PUBLIC_SITE_HOST } from '@/lib/site/domain-routing.ts'
import { siteContentErrorMessage } from './form-errors'
import { formatSavedAt } from './format'

const MEMBERS_ENDPOINT = '/api/site/members'

// 官网直达链接：成员卡位展示在 vision 页（brief 指定的失效路径之一），
// 日文是默认语言，走无前缀路径（同 news 的 publicNewsUrl 理由）。
function publicVisionUrl(): string {
  return `https://${PUBLIC_SITE_HOST}/vision`
}

/**
 * 卡位网格：先用 SectionCard + 现有原语（Tag/Button/Modal/Field）拼，没有
 * 新建任何 ui/ 原语（brief Step 2 要求"拼不动再建"，这里拼得动）。点开单卡
 * 编辑用 Modal + MemberEditForm（内部是 Field 单列）。
 *
 * 卡位数据驱动之后（20260815132734_member_slots_flexible.sql 起）新增
 * ①「新增卡位」（Modal + MemberCreateForm）与 ② 每卡的删除入口（Modal +
 * danger Button，同 NewsAdminView 的删除确认一致）。「新增卡位」按钮挂在
 * Header.actions 里，不依赖 rows 是否为空——这正是要修的死锁本身：
 * `site_members` 若因故是空表，之前后台只能读到 0 行、渲染 0 张卡，且没有
 * 写入口，UI 上没有任何按钮能把数据补回去。EmptyState 的 action 再放一个
 * 同样的入口只是锦上添花，Header 里那个才是即使为空也始终存在的救生索。
 */
export default function MembersAdminView({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('siteMembers')
  const tCommon = useTranslations('common')
  const locale = useLocale()

  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<MemberRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function errorMessage(code: string): string {
    return siteContentErrorMessage(t, code, ['invalid_no'])
  }

  async function load() {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(MEMBERS_ENDPOINT)
      const json = (await res.json()) as { data?: MemberRow[]; error?: string }
      if (!res.ok) { setLoadError(true); return }
      setRows(json.data ?? [])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSaved() {
    setEditing(null)
    await load()
  }

  async function handleCreated() {
    setCreating(false)
    await load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`${MEMBERS_ENDPOINT}/${deleteTarget.no}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTarget(null)
        await load()
        return
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      setDeleteError(errorMessage(json.error ?? 'unknown'))
    } catch {
      setDeleteError(errorMessage('unknown'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => window.open(publicVisionUrl(), '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="w-4 h-4" /> {t('viewOnSite')}
            </Button>
            {isAdmin && (
              <Button size="lg" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> {t('add')}
              </Button>
            )}
          </div>
        }
      />

      <SectionCard icon={<Users />} title={t('listTitle')}>
        {loading ? (
          <LoadingState variant="list" rows={12} />
        ) : loadError ? (
          <ErrorState detail={tCommon('loadFailed')} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('empty')}
            hint={t('emptyHint')}
            action={isAdmin ? <Button size="sm" onClick={() => setCreating(true)}>{t('add')}</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {rows.map((row) => (
              <div key={row.no} className="rounded-field border border-line p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-micro font-mono text-ink-400">{t('cardNo', { no: row.no })}</span>
                  <Tag
                    size="sm"
                    tone={row.is_revealed ? 'success' : 'neutral'}
                    label={row.is_revealed ? t('revealedTag') : t('unrevealedTag')}
                  />
                </div>

                {row.is_revealed && row.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.photo_url}
                    alt=""
                    className="w-full aspect-square rounded-field object-cover border border-line"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="w-full aspect-square rounded-field border border-dashed border-line-strong flex items-center justify-center text-ink-400"
                  >
                    <ImageOff className="w-6 h-6" strokeWidth={1.5} />
                  </div>
                )}

                <div className="text-sm font-semibold text-ink-900 truncate">
                  {row.name || t('unnamedCard')}
                </div>

                {row.is_revealed ? (
                  <div className="text-xs text-ink-500 truncate min-h-[1.25rem]">{row.specialty_ja}</div>
                ) : (
                  <div className="text-xs text-ink-500 min-h-[1.25rem]">
                    {row.expected_reveal_on
                      ? t('expectedReveal', { date: row.expected_reveal_on })
                      : t('expectedRevealUnset')}
                  </div>
                )}

                <div className="text-micro text-ink-400 truncate">
                  {tCommon('lastSaved', { time: formatSavedAt(row.updated_at, locale) })}
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => setEditing(row)}>
                      <Pencil className="w-3.5 h-3.5" /> {t('edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={tCommon('delete')}
                      title={tCommon('delete')}
                      onClick={() => {
                        setDeleteError(null)
                        setDeleteTarget(row)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? t('editTitle', { name: editing.name || t('unnamedCard') }) : ''}
      >
        {editing && (
          <MemberEditForm row={editing} onCancel={() => setEditing(null)} onSaved={handleSaved} />
        )}
      </Modal>

      <Modal open={creating} onClose={() => setCreating(false)} title={t('addTitle')}>
        <MemberCreateForm onCancel={() => setCreating(false)} onCreated={handleCreated} />
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteError(null)
        }}
        title={t('deleteTitle')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
              disabled={deleting}
            >
              {tCommon('cancel')}
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              {tCommon('delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-700">{t('deleteWarning', { no: deleteTarget?.no ?? '' })}</p>
        {deleteError && (
          <p className="mt-3 text-sm text-danger-text bg-danger-soft border border-danger-border rounded-field px-3 py-2">
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  )
}
