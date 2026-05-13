'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Globe, Lock, Check, X, ChevronDown, Layers } from 'lucide-react'
import Button from '@/components/ui/Button'
import { MAX_VIEWS_PER_USER, type ForecastView } from '@/lib/finance-forecast/views'

interface Props {
  views:          ForecastView[]
  activeViewId:   string | null
  currentUserId:  string
  isAdmin:        boolean
  busy:           boolean
  onSelect:       (viewId: string) => void
  onCreate:       (input: { name: string; note: string }) => Promise<void>
  onUpdate:       (id: string, patch: { name?: string; note?: string; is_public?: boolean }) => Promise<void>
  onDelete:       (id: string) => Promise<void>
}

// Compact trigger + drop-down popover that houses the full view-management
// UI (chips, create / edit forms, admin public toggle, delete confirm).
// When the popover is closed the dashboard only spends ~32px of vertical
// space on this control — significantly less than the prior always-on bar.
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
}: Props) {
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

  // Close on outside pointer / Escape. We allow clicks inside the trigger
  // itself (so the trigger toggles cleanly) and inside the popover (so
  // typing into forms doesn't dismiss the menu).
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
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

  // Reset inline forms whenever the popover closes so the next opening is
  // a clean slate.
  useEffect(() => {
    if (!open) {
      setCreating(false)
      setEditingId(null)
    }
  }, [open])

  const triggerLabel = activeView
    ? activeView.name
    : views.length === 0 ? '新建视角' : '选择视角'
  const triggerOwnerHint = activeView
    ? (activeView.owner_id === currentUserId ? '我的' : activeView.owner_name ?? '系统')
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
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          open
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
            : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
        } ${busy && !open ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <Layers className={`w-3.5 h-3.5 ${open ? 'text-indigo-100' : 'text-slate-400'}`} />
        <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-wider opacity-80">视角</span>
        <span className="truncate max-w-[12rem]">{triggerLabel}</span>
        {triggerOwnerHint && (
          <span className={`text-[10px] font-medium ${open ? 'text-indigo-100' : 'text-slate-400'}`}>
            · {triggerOwnerHint}
          </span>
        )}
        {activeView?.is_public && (
          <Globe className={`w-3 h-3 ${open ? 'text-indigo-100' : 'text-emerald-500'}`} />
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className="absolute top-full left-0 mt-2 w-[min(640px,calc(100vw-2rem))] bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-4 space-y-3"
        >
          {/* Row 1: view chips + new button */}
          <div className="flex flex-wrap items-center gap-2">
            {views.length === 0 && !creating && (
              <span className="text-sm text-slate-400">还没有任何视角 — 创建一个开始预测</span>
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
                title={canCreate ? '新建视角' : `最多 ${MAX_VIEWS_PER_USER} 个自有视角，请先删除一个`}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  canCreate && !busy
                    ? 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400'
                    : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> 新建视角
                <span className="ml-1 text-[10px] text-slate-400 tabular-nums">{ownedCount}/{MAX_VIEWS_PER_USER}</span>
              </button>
            )}
          </div>

          {/* Row 2: inline create form */}
          {creating && (
            <CreateForm
              onCancel={() => setCreating(false)}
              onSubmit={async (input) => {
                await onCreate(input)
                setCreating(false)
              }}
            />
          )}

          {/* Row 3: active view metadata + edit/delete actions */}
          {activeView && !creating && (
            <div className="pt-3 border-t border-slate-100">
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
        </div>
      )}

      {/* Delete confirm — rendered at root so closing the popover doesn't
          accidentally dismiss it. */}
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
  const isMine = view.owner_id === currentUserId
  const ownerLabel = isMine ? '我的' : (view.owner_name ?? '系统')
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <span className="truncate max-w-[14rem]">{view.name}</span>
      <span className={`text-[10px] font-medium ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
        · {ownerLabel}
      </span>
      {view.is_public && (
        <Globe className={`w-3 h-3 ${active ? 'text-indigo-100' : 'text-emerald-500'}`} />
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
  const isMine = view.owner_id === currentUserId
  const ownerLabel = view.owner_id === null
    ? '系统'
    : isMine
      ? '我' : view.owner_name ?? '匿名用户'

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-slate-900 truncate">{view.name}</h3>
          <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            所属 · {ownerLabel}
          </span>
          {view.is_public ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              <Globe className="w-3 h-3" /> 全员可见
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              <Lock className="w-3 h-3" /> 仅自己可见
            </span>
          )}
        </div>
        {view.note && (
          <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap break-words">{view.note}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isAdmin && (
          <button
            type="button"
            onClick={onTogglePublic}
            title={view.is_public ? '取消公开（管理员）' : '设为全员可见（管理员）'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
          >
            {view.is_public ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            {view.is_public ? '取消公开' : '设为公开'}
          </button>
        )}
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={onStartEdit}>
            <Pencil className="w-3.5 h-3.5" /> 编辑
          </Button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onRequestDelete}
            title="删除视角（连同其全部预测数据）"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> 删除
          </button>
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
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">备注</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可选 — 描述这个视角的预测假设、用途等"
            className="w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {canTogglePublic ? (
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            全员可见（管理员开关）
          </label>
        ) : (
          <span className="text-xs text-slate-400">公开开关仅管理员可调整</span>
        )}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            <X className="w-3.5 h-3.5" /> 取消
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            <Check className="w-3.5 h-3.5" /> {submitting ? '保存中…' : '保存'}
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
    <div className="pt-3 border-t border-slate-100 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">名称（必填）</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="例如：保守预测 / Q1 复盘"
            className="w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700 mb-1">备注</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可选 — 描述这个视角的预测假设"
            className="w-full min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5" /> 取消
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          <Check className="w-3.5 h-3.5" /> {submitting ? '创建中…' : '创建'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-5">
        <h3 className="text-base font-bold text-slate-900 mb-2">确认删除视角</h3>
        <p className="text-sm text-slate-600 mb-1">
          将永久删除视角 <strong className="text-slate-900">{view.name}</strong> 以及它包含的全部预测输入（3 年的月度账号数据、实收、备注）。
        </p>
        <p className="text-xs text-red-600 mb-4">此操作不可撤销。</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            取消
          </Button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> {submitting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
