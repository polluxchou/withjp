'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Tag from '@/components/ui/Tag'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import { toneOf } from '@/lib/ui/status-tone'
import WorkTaskForm from './WorkTaskForm'
import {
  DEPARTMENT_LABELS,
  utilisationTone,
  buildUserWorkloads,
  toDateStr,
  getWeekDates,
  getWeekLabel,
  WORKING_HOURS_PER_DAY,
} from '@/lib/work-tasks/cost'
import type { WorkTask, AgentRole } from '@/lib/types'

interface Props {
  tasks:     WorkTask[]
  salaryMap: Record<string, number>
  userMeta:  Record<string, { name: string; user_code: string; role: AgentRole }>
  onRefresh: () => void
}

function fmtRmb(v: number) {
  return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function WorkloadWeekView({ tasks, salaryMap, userMeta, onRefresh }: Props) {
  const t = useTranslations('workTasks')
  const DAY_LABELS = t.raw('weekdays') as string[]
  const [refDate,  setRefDate]  = useState(new Date())
  const [creating, setCreating] = useState<string | null>(null)   // date string
  const [detail,   setDetail]   = useState<{ user: string; date: string; tasks: WorkTask[] } | null>(null)

  const weekDates  = getWeekDates(refDate)
  const weekLabel  = getWeekLabel(weekDates)
  const weekStrs   = weekDates.map(toDateStr)

  // Filter tasks to this week
  const weekTasks  = tasks.filter((t) => weekStrs.includes(t.task_date))
  const workloads  = buildUserWorkloads(weekTasks, salaryMap, userMeta)

  function prevWeek() {
    const d = new Date(refDate)
    d.setDate(d.getDate() - 7)
    setRefDate(d)
  }

  function nextWeek() {
    const d = new Date(refDate)
    d.setDate(d.getDate() + 7)
    setRefDate(d)
  }

  // hours per user per day
  function hoursForUserDay(userId: string, dateStr: string): number {
    return tasks
      .filter((t) => t.task_date === dateStr && t.status !== 'cancelled')
      .filter((t) => t.owner_user_id === userId || t.executor_ids.includes(userId))
      .reduce((s, t) => s + t.effort_hours, 0)
  }

  function tasksForUserDay(userId: string, dateStr: string): WorkTask[] {
    return tasks
      .filter((t) => t.task_date === dateStr && t.status !== 'cancelled')
      .filter((t) => t.owner_user_id === userId || t.executor_ids.includes(userId))
  }

  // weekly hours for a user
  function weekHours(userId: string): number {
    return weekStrs.reduce((s, d) => s + hoursForUserDay(userId, d), 0)
  }

  // weekly cost for a user
  function weekCost(userId: string): number {
    const salary = salaryMap[userId] ?? 0
    const rate   = salary / 22 / WORKING_HOURS_PER_DAY
    return rate * weekHours(userId)
  }

  // all users who appear in weekly tasks
  const userIds = Array.from(
    new Set(weekTasks.flatMap((t) => [t.owner_user_id, ...t.executor_ids]))
  )

  // sort by weekly hours desc
  const sortedUsers = userIds
    .map((id) => ({
      id,
      name:       userMeta[id]?.name ?? id,
      department: userMeta[id]?.role ?? 'ops',
    }))
    .sort((a, b) => weekHours(b.id) - weekHours(a.id))

  const today = toDateStr(new Date())

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevWeek} className="p-1.5 rounded-field hover:bg-line-soft text-ink-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-ink-700">{weekLabel}</span>
        <button onClick={nextWeek} className="p-1.5 rounded-field hover:bg-line-soft text-ink-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Grid — member × day matrix, multi-column numeric comparison
          (design-system.md §6.1) so it goes through the Table primitive
          rather than a hand-rolled CSS grid. Tfoot has no shared primitive
          yet (Table.tsx only exports Table/THead/TBody/Th/Tr/Td) so the
          totals row below is a plain <tfoot> styled directly with tokens. */}
      <div className="bg-surface border border-line rounded-card overflow-hidden">
        <Table minWidth={720} label={weekLabel}>
          <THead>
            <Th className="w-40">{t('table.member')}</Th>
            {weekDates.map((d, i) => {
              const ds = toDateStr(d)
              const isToday = ds === today
              return (
                <Th key={ds} align="center" className={isToday ? 'bg-primary-soft' : ''}>
                  <div className={isToday ? 'text-primary' : ''}>{DAY_LABELS[i]}</div>
                  <div className={`font-normal ${isToday ? 'text-primary/70' : 'text-ink-400'}`}>
                    {d.getMonth() + 1}/{d.getDate()}
                  </div>
                </Th>
              )
            })}
            <Th align="center" className="w-20">{t('table.totalHoursCol')}</Th>
            <Th align="center" className="w-24">{t('table.labourCostCol')}</Th>
          </THead>
          <TBody>
            {sortedUsers.length === 0 ? (
              <Tr>
                <Td colSpan={10} className="py-12 text-center text-ink-400">{t('emptyWeek')}</Td>
              </Tr>
            ) : (
              sortedUsers.map((u) => (
                <Tr key={u.id}>
                  {/* Name */}
                  <Td>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-primary-soft flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {u.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink-900 truncate">{u.name}</p>
                        <p className="text-xs text-ink-400">{DEPARTMENT_LABELS[u.department as AgentRole]}</p>
                      </div>
                    </div>
                  </Td>

                  {/* Day cells */}
                  {weekStrs.map((ds) => {
                    const h    = hoursForUserDay(u.id, ds)
                    const dayTasks = tasksForUserDay(u.id, ds)
                    const isToday  = ds === today
                    return (
                      <Td key={ds} align="center" className={isToday ? 'bg-primary-soft' : ''}>
                        {h > 0 ? (
                          <button
                            type="button"
                            onClick={() => dayTasks.length > 0 && setDetail({ user: u.name, date: ds, tasks: dayTasks })}
                            className="inline-flex flex-col items-center gap-0.5 rounded-field px-1 py-0.5 hover:bg-row-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
                          >
                            <Tag variant="soft" size="sm" tone={utilisationTone(h)} label={`${h}h`} />
                            <span className="text-xs text-ink-400">{t('summary.tasksItem', { count: dayTasks.length })}</span>
                          </button>
                        ) : (
                          <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-line-soft" />
                        )}
                      </Td>
                    )
                  })}

                  {/* Total hours */}
                  <Td align="center">
                    <Tag variant="soft" size="sm" tone={utilisationTone(weekHours(u.id) / 5)} label={`${weekHours(u.id)}h`} />
                  </Td>

                  {/* Weekly cost */}
                  <Td align="center" numeric>{fmtRmb(weekCost(u.id))}</Td>
                </Tr>
              ))
            )}
          </TBody>
          {sortedUsers.length > 0 && (
            <tfoot>
              <tr className="bg-canvas border-t border-line">
                <td className="px-3 py-2 text-xs font-medium text-ink-500">{t('table.dayTotal')}</td>
                {weekStrs.map((ds) => {
                  const totalH = sortedUsers.reduce((s, u) => s + hoursForUserDay(u.id, ds), 0)
                  return (
                    <td key={ds} className="px-1 py-2 text-center text-xs font-medium text-ink-600 tabular-nums">
                      {totalH > 0 ? `${totalH}h` : ''}
                    </td>
                  )
                })}
                <td className="px-2 py-2 text-center text-xs font-semibold text-ink-700 tabular-nums">
                  {sortedUsers.reduce((s, u) => s + weekHours(u.id), 0)}h
                </td>
                <td className="px-2 py-2 text-center text-xs font-semibold text-ink-700 tabular-nums">
                  {fmtRmb(sortedUsers.reduce((s, u) => s + weekCost(u.id), 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </Table>
      </div>

      {/* Quick add row */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {weekDates.map((d) => {
          const ds = toDateStr(d)
          return (
            <button
              key={ds}
              onClick={() => setCreating(ds)}
              className="text-xs px-3 py-1.5 rounded-field border border-dashed border-line-strong text-ink-400 hover:border-primary-border hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
            >
              {t('table.addToDay', { month: d.getMonth() + 1, day: d.getDate() })}
            </button>
          )
        })}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.user} · ${detail.date}` : ''}
      >
        {detail && (
          <div className="space-y-2">
            {detail.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-field">
                <span className="text-xs font-medium text-ink-600 flex-1">{task.title}</span>
                <span className="text-xs text-ink-400 tabular-nums">{task.effort_hours}h</span>
                <Tag
                  size="sm"
                  tone={toneOf('work_task', task.status)}
                  label={task.status === 'done' ? t('status.done') : task.status === 'doing' ? t('status.doing') : t('status.planned')}
                />
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Create modal */}
      <Modal open={!!creating} onClose={() => setCreating(null)} title={t('addTask')} width="max-w-2xl">
        {creating && (
          <WorkTaskForm
            defaultDate={creating}
            onSuccess={() => { setCreating(null); onRefresh() }}
            onCancel={() => setCreating(null)}
          />
        )}
      </Modal>
    </div>
  )
}
