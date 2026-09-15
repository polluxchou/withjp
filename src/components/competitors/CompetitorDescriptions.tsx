// src/components/competitors/CompetitorDescriptions.tsx
'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { todayLocal } from '@/lib/competitors/localDate'
import type { CompetitorDescription } from '@/lib/competitors/types'
import { FOCUS_RING } from '@/lib/ui/recipes'
import Tag from '@/components/ui/Tag'
import { Input, Textarea } from '@/components/ui/Field'

/** 浮层最大宽度(px)。与 RegionLiveRuler 的 368 同档，两个浮层并排出现时不会一宽一窄。 */
const PANEL_MAX_PX = 368

/** 列表区最大高度(px)。超过就内部滚动，不让浮层长到把整张卡盖住。 */
const LIST_MAX_PX = 300

/**
 * 竞品昵称旁的「直播间风格描述」浮层。
 *
 * 内容来自两处：本地任务生成的总结（source='auto'）与人在这里手写的补充
 * （source='manual'），同一个列表按生成日期倒序，最新的在最上。
 *
 * 为什么不跟 RegionLiveRuler 一样支持 hover 展开：那个浮层是只读的对比图表，
 * 蹭上去弹出来没有代价；这个里面有文本框和删除按钮，鼠标扫过卡片时弹出来会
 * 打断输入、也容易误触删除。所以只认点击与键盘，Escape 和点击外部收起。
 */
export default function CompetitorDescriptions({
  competitorId,
  descriptions,
  canEdit,
  onChanged,
}: {
  competitorId: string
  /** 已按生成日期倒序（assembleBoard 里排好，见 lib/competitors/descriptions.ts）。 */
  descriptions: CompetitorDescription[]
  canEdit: boolean
  onChanged: () => void
}) {
  const t = useTranslations('competitors')
  const tCommon = useTranslations('common')
  const panelId = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // 编辑态：editingId 为 'new' 表示新增那一条，其余是被编辑行的 id。
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [draftDate, setDraftDate] = useState('')

  const count = descriptions.length
  // 没有描述、又没有编辑权限时整个触发器都不渲染：那颗图标点开只会是一句空提示，
  // 而这一行的横向空间是精算过的（见 CompetitorCard 里 shrink-[3] 的注释）。
  const visible = count > 0 || canEdit

  const closeAll = useCallback(() => {
    setOpen(false)
    setEditingId(null)
    setError(null)
  }, [])

  // 点击浮层外部收起。编辑中不收：正在打字时点一下卡片空白处就丢草稿太伤人。
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent) => {
      if (editingId) return
      if (!wrapRef.current?.contains(e.target as Node | null)) closeAll()
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open, editingId, closeAll])

  // 浮层锚在触发器左缘，窄屏上会顶穿右边界，而溢出的绝对定位元素会把整页撑出
  // 横向滚动条。这段与 RegionLiveRuler 同源，两个坑也一样：必须用布局视口
  // documentElement.clientWidth（window.innerWidth 含滚动条区，实测差 58px），
  // 且量触发器而不是量浮层自己（量自己要先画一帧未夹的再修，会闪）。
  const [box, setBox] = useState<{ shift: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      setBox(null)
      return
    }
    const wrap = wrapRef.current
    if (!wrap) return
    const margin = 8
    const vw = document.documentElement.clientWidth
    const width = Math.min(PANEL_MAX_PX, vw - margin * 2)
    const left = wrap.getBoundingClientRect().left
    const overRight = left + width - (vw - margin)
    setBox({ shift: overRight > 0 ? -Math.min(overRight, Math.max(left - margin, 0)) : 0, width })
  }, [open])

  const startAdd = () => {
    setError(null)
    setEditingId('new')
    setDraftBody('')
    // 手写那条默认记在今天。todayLocal 读时钟，所以只在这个事件处理器里取，
    // 不放进渲染期（服务端 UTC 与浏览器时区会算出不同的日期）。
    setDraftDate(todayLocal())
  }

  const startEdit = (d: CompetitorDescription) => {
    setError(null)
    setEditingId(d.id)
    setDraftBody(d.body)
    setDraftDate(d.generated_on)
  }

  const submit = async () => {
    const body = draftBody.trim()
    if (!body || !draftDate) {
      setError(t('descriptionBodyRequired'))
      return
    }
    setPending(true)
    setError(null)
    try {
      const res = editingId === 'new'
        ? await fetch(`/api/competitors/${competitorId}/descriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body, generated_on: draftDate }),
          })
        : await fetch(`/api/competitors/descriptions/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body, generated_on: draftDate }),
          })
      const json = await res.json().catch(() => ({ error: 'parse' }))
      if (!res.ok || json.error) {
        setError(t('actionFailed'))
        return
      }
      setEditingId(null)
      onChanged()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setPending(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm(t('descriptionDeleteConfirm'))) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/competitors/descriptions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setError(t('actionFailed'))
        return
      }
      onChanged()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setPending(false)
    }
  }

  if (!visible) return null

  const editor = (
    <div className="space-y-1.5">
      <Textarea
        autoFocus
        value={draftBody}
        onChange={(e) => setDraftBody(e.target.value)}
        placeholder={t('descriptionPlaceholder')}
        size="sm"
        className="text-xs"
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={draftDate}
          max={todayLocal()}
          onChange={(e) => setDraftDate(e.target.value)}
          aria-label={t('descriptionDate')}
          size="sm"
          className="flex-1 text-xs"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          aria-label={tCommon('save')}
          className={`rounded-field text-primary hover:text-primary-hover disabled:opacity-50 ${FOCUS_RING}`}
        >
          <Check size={15} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => { setEditingId(null); setError(null) }}
          aria-label={tCommon('cancel')}
          className={`rounded-field text-ink-400 hover:text-ink-700 ${FOCUS_RING}`}
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )

  return (
    <span
      ref={wrapRef}
      className="relative shrink-0"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        e.stopPropagation()
        // 编辑中先退编辑、再按一次才关浮层：一次 Escape 同时丢掉草稿和浮层太狠。
        if (editingId) { setEditingId(null); return }
        closeAll()
      }}
    >
      <button
        type="button"
        onClick={() => (open ? closeAll() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('descriptionsLabel', { count })}
        className={`rounded-btn ${FOCUS_RING}`}
      >
        {/* 有描述时连条数一起显示 —— 条数本身就是"这个号攒了多少观察"的信息。
            一条没有时（只有管理员看得到）退成一枚灰图标,不写 0。 */}
        <span
          className={`inline-flex items-center gap-1 rounded-btn px-2 py-0.5 text-micro font-medium ${
            count > 0 ? 'bg-primary-soft text-primary-hover' : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          <Sparkles size={12} strokeWidth={1.5} />
          {count > 0 && <span className="tabular-nums">{count}</span>}
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-40 max-w-[calc(100vw-1rem)] pt-2"
          style={{
            width: box ? `${box.width}px` : PANEL_MAX_PX,
            transform: box?.shift ? `translateX(${box.shift}px)` : undefined,
          }}
        >
          <div
            id={panelId}
            className="w-full overflow-hidden rounded-card border border-line bg-surface text-left shadow-card"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
              <span className="text-xs font-medium text-ink-900">{t('descriptionsTitle')}</span>
              {canEdit && editingId !== 'new' && (
                <button
                  type="button"
                  onClick={startAdd}
                  className={`inline-flex items-center gap-0.5 rounded-field text-micro text-ink-500 hover:text-ink-900 ${FOCUS_RING}`}
                >
                  <Plus size={12} strokeWidth={1.5} />
                  {t('descriptionAdd')}
                </button>
              )}
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: LIST_MAX_PX }}>
              {editingId === 'new' && (
                <div className="border-b border-line-soft px-3 py-2">{editor}</div>
              )}

              {count === 0 && editingId !== 'new' ? (
                <p className="px-3 py-3 text-micro text-ink-500">{t('descriptionsEmpty')}</p>
              ) : (
                descriptions.map((d) => (
                  <div key={d.id} className="border-b border-line-soft px-3 py-2 last:border-b-0">
                    {editingId === d.id ? (
                      editor
                    ) : (
                      <>
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="text-micro tabular-nums text-ink-700">{d.generated_on}</span>
                          <Tag
                            label={d.source === 'auto' ? t('descriptionSourceAuto') : t('descriptionSourceManual')}
                            tone={d.source === 'auto' ? 'violet' : 'neutral'}
                            size="sm"
                          />
                          {canEdit && (
                            <span className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(d)}
                                aria-label={t('descriptionEdit')}
                                className={`rounded-field text-ink-400 hover:text-ink-700 ${FOCUS_RING}`}
                              >
                                <Pencil size={12} strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                onClick={() => remove(d.id)}
                                disabled={pending}
                                aria-label={t('descriptionDelete')}
                                className={`rounded-field text-ink-400 hover:text-danger-text disabled:opacity-50 ${FOCUS_RING}`}
                              >
                                <Trash2 size={12} strokeWidth={1.5} />
                              </button>
                            </span>
                          )}
                        </div>
                        {/* whitespace-pre-line:生成的总结常常自带换行分段,压成一坨会很难读。 */}
                        <p className="whitespace-pre-line text-xs leading-relaxed text-ink-700">{d.body}</p>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {error && (
              <p role="status" className="border-t border-line-soft px-3 py-1.5 text-micro text-danger-text">{error}</p>
            )}
          </div>
        </div>
      )}
    </span>
  )
}
