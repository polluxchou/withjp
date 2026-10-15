'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Briefcase, Pencil, Plus, Users, X } from 'lucide-react'
import SectionCard from '@/components/ui/SectionCard'
import Tag from '@/components/ui/Tag'
import type { OrgSnapshot } from '@/lib/types'
import InlineNameInput from './InlineNameInput'
import type { PickerRequest } from './PersonPicker'
import type { OrgActions } from './useOrgSnapshot'

// Small "+ label" text-link idiom shared by every add-affordance in this
// view (add task / add item / add member) — same visual weight as the
// edit/delete row actions next to it, no Button chrome.
const ADD_LINK_CLASS = 'mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover'
// 就地改名输入框：占满名称原来的位置，字号与名称一致。
const NAME_INPUT_CLASS = 'min-w-0 flex-1 h-8 rounded-field border border-primary-border bg-surface px-2 text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring'
// 名称本身就是改名入口（管理员）：鼠标或触屏点一下即进入编辑。不另放「重命名」按钮；
// 桌面悬停 / 键盘聚焦时名称变色并露出铅笔，提示可改。
const NAME_BUTTON_CLASS = 'group min-w-0 inline-flex items-center gap-1 -my-1 py-1 rounded-field text-left hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring'
const NAME_PENCIL_CLASS = 'h-3 w-3 flex-none text-primary-hover opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'

export default function OrgView({ snapshot, actions, onPick }: {
  snapshot: OrgSnapshot
  actions: OrgActions
  onPick: (request: PickerRequest) => void
}) {
  const t = useTranslations('team')
  const canEdit = snapshot.canEdit
  const posName = (id: string) => snapshot.positions.find((p) => p.id === id)?.name ?? id
  // 正在就地改名的任务或事项（同一时间只改一个）
  const [editing, setEditing] = useState<{ kind: 'task' | 'item'; id: string } | null>(null)
  const isEditing = (kind: 'task' | 'item', id: string) => editing?.kind === kind && editing.id === id

  return (
    <div className="space-y-5">
      {!canEdit && <p className="text-xs text-ink-400">{t('org.readonlyHint')}</p>}

      <div className="space-y-4">
        {snapshot.businesses.map((b) => (
          <SectionCard
            key={b.id}
            icon={<Briefcase />}
            title={b.name}
            actions={
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onPick({ title: t('org.setOwner'), allowClear: true, onSelect: (p) => actions.setBusinessOwner(b.id, p) })}
                className={`truncate max-w-[12rem] text-xs ${canEdit ? 'text-primary hover:text-primary-hover' : 'text-ink-500 cursor-default'}`}
              >
                {t('org.owner')}：{b.owner_name ?? t('org.noOwner')}
              </button>
            }
          >
            {/* Task groups separated by hairlines rather than nested cards —
                flattens what used to be card-in-card-in-card (business → task
                box → item box) down to one SectionCard per business. */}
            <div className="divide-y divide-line-soft">
              {b.tasks.map((task) => (
                <div key={task.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    {isEditing('task', task.id) ? (
                      <InlineNameInput
                        initial={task.name}
                        onSave={(value) => { setEditing(null); actions.renameTask(task.id, value) }}
                        onCancel={() => setEditing(null)}
                        className={`${NAME_INPUT_CLASS} font-medium text-sm`}
                      />
                    ) : canEdit ? (
                      <button type="button" onClick={() => setEditing({ kind: 'task', id: task.id })} className={`${NAME_BUTTON_CLASS} font-medium text-sm text-ink-900`}>
                        <span className="truncate">{task.name}</span>
                        <Pencil aria-hidden className={NAME_PENCIL_CLASS} strokeWidth={1.5} />
                      </button>
                    ) : (
                      <div className="font-medium text-sm text-ink-900 min-w-0 truncate">{task.name}</div>
                    )}
                    {canEdit && (
                      <div className="flex gap-3 text-xs flex-none">
                        <button type="button" className="text-primary hover:text-primary-hover" onClick={() => actions.editTaskPositions(task.id, task.position_ids)}>{t('org.editPositions')}</button>
                        <button type="button" className="text-ink-400 hover:text-danger-text" onClick={() => actions.deleteTask(task.id)}>{t('org.delete')}</button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {task.position_ids.length === 0
                      ? <span className="text-xs text-ink-400">{t('org.empty')}</span>
                      : task.position_ids.map((pid) => <Tag key={pid} size="sm" tone="neutral" label={posName(pid)} />)}
                  </div>
                  <ul className="mt-3 divide-y divide-line-soft">
                    {task.items.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2 text-sm py-1.5">
                        {isEditing('item', it.id) ? (
                          <InlineNameInput
                            initial={it.name}
                            onSave={(value) => { setEditing(null); actions.renameItem(it.id, value) }}
                            onCancel={() => setEditing(null)}
                            className={`${NAME_INPUT_CLASS} text-sm`}
                          />
                        ) : canEdit ? (
                          <button type="button" onClick={() => setEditing({ kind: 'item', id: it.id })} className={`${NAME_BUTTON_CLASS} text-ink-700`}>
                            <span className="truncate">{it.name}</span>
                            <Pencil aria-hidden className={NAME_PENCIL_CLASS} strokeWidth={1.5} />
                          </button>
                        ) : (
                          <span className="min-w-0 truncate text-ink-700">{it.name}</span>
                        )}
                        <span className="flex items-center gap-2 flex-none">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => onPick({ title: t('org.setOwner'), allowClear: true, onSelect: (p) => actions.setItemOwner(it.id, p) })}
                            className={`text-xs ${canEdit ? 'text-primary hover:text-primary-hover' : 'text-ink-500 cursor-default'}`}
                          >
                            {it.owner_name ?? t('org.noOwner')}
                          </button>
                          {canEdit && <button type="button" className="text-xs text-ink-400 hover:text-danger-text" onClick={() => actions.deleteItem(it.id)}>{t('org.delete')}</button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canEdit && (
                    <button type="button" className={ADD_LINK_CLASS} onClick={() => actions.addItem(task.id)}>
                      <Plus className="w-3 h-3" strokeWidth={1.5} />{t('org.addItem')}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <button type="button" className={ADD_LINK_CLASS} onClick={() => actions.addTask(b.id)}>
                <Plus className="w-3 h-3" strokeWidth={1.5} />{t('org.addTask')}
              </button>
            )}
          </SectionCard>
        ))}
      </div>

      <SectionCard icon={<Users />} title={t('org.positionsTitle')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {snapshot.positions.map((p) => (
            <div key={p.id} className="border border-line rounded-field p-3">
              <div className="font-medium text-sm text-ink-900">{p.name}</div>
              {p.description && <div className="text-micro text-ink-400 mb-1">{p.description}</div>}
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {p.members.length === 0 && <span className="text-xs text-ink-400">{t('org.empty')}</span>}
                {p.members.map((m) => {
                  const memberLabel = m.display_name || (m.member_type === 'creator' ? t('org.sourceCreator') : t('org.sourceUser'))
                  return (
                    <span key={m.id} className="inline-flex items-center gap-1">
                      <Tag size="sm" tone={m.member_type === 'creator' ? 'violet' : 'neutral'} label={memberLabel} />
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={t('org.removeMemberNamed', { name: memberLabel })}
                          onClick={() => actions.removeMember(p.id, m.id)}
                          // Split-axis padding: px-1.5 -mx-1.5 widens the click target to
                          // 25px, py-1 -my-1 only to 21px — deliberately less on the vertical
                          // axis than the horizontal, so the target doesn't grow into the
                          // gap-1.5 (6px) row spacing and overlap a neighboring member pill
                          // above/below when this Tag+× wraps onto a new line. §4's 32px
                          // floor is not reachable here without that overlap.
                          className="px-1.5 -mx-1.5 py-1 -my-1 text-ink-400 hover:text-danger-text rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
                        >
                          <X className="w-[13px] h-[13px]" strokeWidth={1.5} />
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
              {canEdit && (
                <button type="button" className={ADD_LINK_CLASS} onClick={() => onPick({ title: t('org.addMember'), allowClear: false, onSelect: (person) => { if (person) actions.addMember(p.id, person) } })}>
                  <Plus className="w-3 h-3" strokeWidth={1.5} />{t('org.addMember')}
                </button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
