'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, Globe, Lock, Check, X, ChevronDown, Layers, Repeat } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Tag from '@/components/ui/Tag'
import { Field, Input } from '@/components/ui/Field'
import { FOCUS_RING } from '@/lib/ui/recipes'
import { MAX_VIEWS_PER_USER } from '@/lib/finance-forecast/views-permissions'
import type { ForecastView } from '@/lib/finance-forecast/views'

// 视角选择药丸：ui/ 里没有能承载「名字 + 归属 + 公开图标 + 激活态」的 chip
// 原语（FilterChip 是 label+清除、CountChip 是 label+计数），保留本地形态，
// 只把配色换成 token；与 FinanceForecastDashboard 的月份药丸同款。
const PILL_BASE = 'rounded-field border text-xs font-semibold transition-colors'
const PILL_ACTIVE = 'bg-primary text-white border-primary shadow-card'
const PILL_IDLE = 'bg-surface text-ink-700 border-line-strong hover:border-primary-border hover:text-primary'

interface Props {
  views:               ForecastView[]
  activeViewId:        string | null
  currentUserId:       string
  isAdmin:             boolean
  busy:                boolean
  onSelect:            (viewId: string) => void
  onCreate:            (input: { name: string; note: string }) => Promise<void>
  onUpdate:            (id: string, patch: { name?: string; note?: string; is_public?: boolean }) => Promise<void>
  onDelete:            (id: string) => Promise<void>
  onOpenLifecycle?:    () => void
}

export default function ForecastViewBar({
  views,
  activeViewId,
  currentUserId,
  isAdmin,
  busy,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onOpenLifecycle,
}: Props) {
  const t = useTranslations('financeForecast')
  const [open, setOpen]                       = useState(false)
  const [creating, setCreating]               = useState(false)
  const [editingId, setEditingId]             = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement   | null>(null)

  const activeView = views.find((v) => v.id === activeViewId) ?? null
  const ownedCount = views.filter((v) => v.owner_id === currentUserId).length
  const canCreate  = ownedCount < MAX_VIEWS_PER_USER
  const canEditActive = activeView
    ? (isAdmin || activeView.owner_id === currentUserId)
    : false

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setCreating(false)
      setEditingId(null)
    }
  }, [open])

  const triggerLabel = activeView
    ? activeView.name
    : views.length === 0 ? t('viewCreateNew') : t('viewSelectView')
  const triggerOwnerHint = activeView
    ? (activeView.owner_id === currentUserId ? t('viewOwnerMe') : activeView.owner_name ?? t('viewOwnerSystem'))
    : null

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy && !open}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${open ? PILL_ACTIVE : PILL_IDLE} ${busy && !open ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <Layers className={`w-3.5 h-3.5 ${open ? 'text-white/85' : 'text-ink-400'}`} strokeWidth={1.5} />
        <span className="hidden sm:inline text-micro font-medium uppercase tracking-wider opacity-80">{t('viewBarLabel')}</span>
        <span className="truncate max-w-[12rem]">{triggerLabel}</span>
        {triggerOwnerHint && (
          <span className={`text-micro font-medium ${open ? 'text-white/85' : 'text-ink-400'}`}>
            · {triggerOwnerHint}
          </span>
        )}
        {activeView?.is_public && (
          <Globe aria-hidden className={`w-3 h-3 ${open ? 'text-white/85' : 'text-success-dot'}`} strokeWidth={1.5} />
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          // 非阻断下拉（点外面/Escape 即关，不锁滚动、不抢焦点）→ 保留本地
          // popover，只把配色换成 token；z-40 = §3 层级表的下拉/popover 档。
          className="absolute top-full left-0 mt-2 w-[min(640px,calc(100vw-2rem))] bg-surface border border-line rounded-card shadow-pop z-40 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            {views.length === 0 && !creating && (
              <span className="text-sm text-ink-400">{t('viewNoViews')}</span>
            )}

            {views.map((view) => (
              <ViewChip
                key={view.id}
                view={view}
                active={view.id === activeViewId}
                currentUserId={currentUserId}
                disabled={busy}
                onClick={() => {
                  onSelect(view.id)
                  setOpen(false)
                }}
              />
            ))}

            {!creating && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={!canCreate || busy}
                title={canCreate ? t('viewCreateNew') : t('viewMaxHint', { max: MAX_VIEWS_PER_USER })}
                className={`inline-flex items-center gap-1 px-3 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${
                  canCreate && !busy
                    ? 'bg-surface text-primary border-primary-border hover:border-primary'
                    : 'bg-canvas text-ink-400 border-line cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('viewCreateNew')}
                <span className="ml-1 text-micro text-ink-400 tabular-nums">{ownedCount}/{MAX_VIEWS_PER_USER}</span>
              </button>
            )}
          </div>

          {creating && (
            <CreateForm
              onCancel={() => setCreating(false)}
              onSubmit={async (input) => {
                await onCreate(input)
                setCreating(false)
              }}
            />
          )}

          {activeView && !creating && (
            <div className="pt-3 border-t border-line-soft">
              {editingId === activeView.id ? (
                <EditForm
                  view={activeView}
                  canTogglePublic={isAdmin}
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (patch) => {
                    await onUpdate(activeView.id, patch)
                    setEditingId(null)
                  }}
                />
              ) : (
                <MetadataDisplay
                  view={activeView}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                  canEdit={canEditActive}
                  onStartEdit={() => setEditingId(activeView.id)}
                  onRequestDelete={() => setConfirmDeleteId(activeView.id)}
                  onTogglePublic={() => onUpdate(activeView.id, { is_public: !activeView.is_public })}
                />
              )}
            </div>
          )}

          {onOpenLifecycle && !creating && editingId === null && (
            <div className="pt-3 border-t border-line-soft flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink-700">{t('viewLifecycleTitle')}</p>
                <p className="text-micro text-ink-400">{t('viewLifecycleSub')}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => { onOpenLifecycle(); setOpen(false) }}>
                <Repeat className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('viewEditTemplate')}
              </Button>
            </div>
          )}
        </div>
      )}

      {confirmDeleteId && (
        <DeleteConfirm
          view={views.find((v) => v.id === confirmDeleteId)!}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={async () => {
            await onDelete(confirmDeleteId)
            setConfirmDeleteId(null)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function ViewChip({
  view,
  active,
  currentUserId,
  disabled,
  onClick,
}: {
  view:          ForecastView
  active:        boolean
  currentUserId: string
  disabled:      boolean
  onClick:       () => void
}) {
  const t = useTranslations('financeForecast')
  const isMine = view.owner_id === currentUserId
  const ownerLabel = isMine ? t('viewOwnerMe') : (view.owner_name ?? t('viewOwnerSystem'))
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // 本 chip 渲染在 role="menu" 弹层内 → 用 menuitemradio/aria-checked，
      // 不用 aria-pressed（toggle 语义在 menu 子项上不合法），与
      // FinanceForecastDashboard 的 ScopeOption 保持同一种做法。
      role="menuitemradio"
      aria-checked={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${PILL_BASE} ${FOCUS_RING} ${active ? PILL_ACTIVE : PILL_IDLE} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <span className="truncate max-w-[14rem]">{view.name}</span>
      <span className={`text-micro font-medium ${active ? 'text-white/85' : 'text-ink-400'}`}>
        · {ownerLabel}
      </span>
      {view.is_public && (
        <Globe aria-hidden className={`w-3 h-3 ${active ? 'text-white/85' : 'text-success-dot'}`} strokeWidth={1.5} />
      )}
    </button>
  )
}

function MetadataDisplay({
  view,
  isAdmin,
  currentUserId,
  canEdit,
  onStartEdit,
  onRequestDelete,
  onTogglePublic,
}: {
  view:           ForecastView
  isAdmin:        boolean
  currentUserId:  string
  canEdit:        boolean
  onStartEdit:    () => void
  onRequestDelete: () => void
  onTogglePublic: () => void
}) {
  const t = useTranslations('financeForecast')
  const isMine = view.owner_id === currentUserId
  const ownerLabel = view.owner_id === null
    ? t('viewOwnerSystem')
    : isMine
      ? t('viewOwnerMeLabel') : view.owner_name ?? t('viewOwnerAnon')

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-md font-semibold text-ink-900 truncate">{view.name}</h3>
          {/* 归属/可见性徽章走共享 Tag（§6.1 状态展示）；tone 映射登记在
              design-system §1.3。Tag 没有图标位，Globe/Lock 由文案本身承载语义。 */}
          <Tag label={t('viewOwnerBadge', { owner: ownerLabel })} tone="neutral" size="sm" />
          <Tag label={view.is_public ? t('viewPublic') : t('viewPrivate')} tone={view.is_public ? 'success' : 'neutral'} size="sm" />
        </div>
        {view.note && (
          <p className="text-xs text-ink-500 mt-1 whitespace-pre-wrap break-words">{view.note}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isAdmin && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onTogglePublic}
            title={view.is_public ? t('viewRemovePublicAdmin') : t('viewMakePublicAdmin')}
          >
            {view.is_public ? <Lock className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />}
            {view.is_public ? t('viewRemovePublicAdmin') : t('viewMakePublic')}
          </Button>
        )}
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={onStartEdit}>
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('viewEdit')}
          </Button>
        )}
        {canEdit && (
          <Button variant="danger" size="sm" onClick={onRequestDelete} title={t('viewDeleteHint')}>
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('viewDelete')}
          </Button>
        )}
      </div>
    </div>
  )
}

function EditForm({
  view,
  canTogglePublic,
  onCancel,
  onSubmit,
}: {
  view:            ForecastView
  canTogglePublic: boolean
  onCancel:        () => void
  onSubmit:        (patch: { name?: string; note?: string; is_public?: boolean }) => Promise<void>
}) {
  const t = useTranslations('financeForecast')
  const [name, setName]         = useState(view.name)
  const [note, setNote]         = useState(view.note)
  const [isPublic, setIsPublic] = useState(view.is_public)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = name.trim().length > 0 && name.trim().length <= 60 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const patch: { name?: string; note?: string; is_public?: boolean } = {}
      if (name.trim() !== view.name) patch.name = name.trim()
      if (note !== view.note) patch.note = note
      if (canTogglePublic && isPublic !== view.is_public) patch.is_public = isPublic
      await onSubmit(patch)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <Field label={t('viewEditNameLabel')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label={t('viewEditNoteLabel')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('viewEditNotePlaceholder')} />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {canTogglePublic ? (
          // 复选框：ui/Field 只登记了 Input/Select/Textarea，没有 Checkbox 原语，
          // 保留原生 input 并用 accent-primary 让勾选色对齐品牌色。
          // focus 环挂在 input 本身（§4 唯一配方），不用 focus-within 画在 label 上
          // ——那是自定义 focus 样式，且键盘焦点实际落点是 input，环画在外层会
          // 让焦点位置读起来比真实范围大一圈。
          <label className="inline-flex items-center gap-2 text-xs text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className={`w-3.5 h-3.5 accent-primary rounded-sm ${FOCUS_RING}`}
            />
            {t('viewPublicToggle')}
          </label>
        ) : (
          <span className="text-xs text-ink-400">{t('viewPublicReadonly')}</span>
        )}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            <X className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('viewEditCancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            <Check className="w-3.5 h-3.5" strokeWidth={1.5} /> {submitting ? t('viewSaving') : t('viewSave')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CreateForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (input: { name: string; note: string }) => Promise<void>
}) {
  const t = useTranslations('financeForecast')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = name.trim().length > 0 && name.trim().length <= 60 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({ name: name.trim(), note: note.trim() })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pt-3 border-t border-line-soft space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <Field label={t('viewCreateNameLabel')}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t('viewCreateNamePlaceholder')}
          />
        </Field>
        <Field label={t('viewCreateNoteLabel')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('viewCreateNotePlaceholder')} />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('viewCreateCancel')}
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          <Check className="w-3.5 h-3.5" strokeWidth={1.5} /> {submitting ? t('viewCreating') : t('viewCreate')}
        </Button>
      </div>
    </div>
  )
}

function DeleteConfirm({
  view,
  onCancel,
  onConfirm,
}: {
  view:      ForecastView
  onCancel:  () => void
  onConfirm: () => Promise<void>
}) {
  const t = useTranslations('financeForecast')
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // 阻断式危险确认 → 共享 Modal + danger Button（design-system §6.1 / §6.3），
    // 不再手写 fixed inset-0 遮罩（原来的 z-50 也不在 §3 层级表的 Modal 档上）。
    <Modal
      open
      onClose={onCancel}
      title={t('viewDeleteTitle')}
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            {t('viewDeleteCancel')}
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={submitting}>
            {submitting
              ? t('viewDeleting')
              : <><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('viewDeleteConfirm')}</>}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-700 mb-1">
        {t('viewDeleteDesc', { name: view.name })}
      </p>
      <p className="text-xs text-danger-text">{t('viewDeleteWarning')}</p>
    </Modal>
  )
}
