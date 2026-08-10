'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Table, THead, TBody, Th, Tr, Td } from '@/components/ui/Table'
import WorkTaskForm from './WorkTaskForm'
import {
  DEPARTMENT_LABELS,
  utilisationColor,
  getMonthWeeks,
  toDateStr,
  WORKING_HOURS_PER_DAY,
  WORKING_DAYS_PER_MONTH,
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

export default function WorkloadMonthView({ tasks, salaryMap, userMeta, onRefresh }: Props) {
  const t = useTranslations('workTasks')
  const now    = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [creating, setCreating] = useState<string | null>(null)

  const weeks     = getMonthWeeks(year, month)
  const weekLabels = weeks.map((w) => {
    const start = w[0]; const end = w[6]
    return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`
  })

  // Month date strings
  const allDatesInMonth = Array.from(
    { length: new Date(year, month, 0).getDate() },
    (_, i) => toDateStr(new Date(year, month - 1, i + 1))
  )

  // Filter tasks to this month
  const monthTasks = tasks.filter((t) => allDatesInMonth.includes(t.task_date))

  // All users in month
  const userIds = Array.from(
    new Set(monthTasks.flatMap((t) => [t.owner_user_id, ...t.executor_ids]))
  )

  function hoursForUserWeek(userId: string, weekDates: Date[]): number {
    const strs = weekDates.map(toDateStr)
    return tasks
      .filter((t) => strs.includes(t.task_date) && t.status !== 'cancelled')
      .filter((t) => t.owner_user_id === userId || t.executor_ids.includes(userId))
      .reduce((s, t) => s + t.effort_hours, 0)
  }

  function monthHours(userId: string): number {
    return allDatesInMonth.reduce((s, ds) => {
      return s + tasks
        .filter((t) => t.task_date === ds && t.status !== 'cancelled')
        .filter((t) => t.owner_user_id === userId || t.executor_ids.includes(userId))
        .reduce((ss, t) => ss + t.effort_hours, 0)
    }, 0)
  }

  function monthCost(userId: string): number {
    const salary = salaryMap[userId] ?? 0
    const rate   = salary / WORKING_DAYS_PER_MONTH / WORKING_HOURS_PER_DAY
    return rate * monthHours(userId)
  }

  // avg daily hours per week (for colour coding)
  function avgDailyHoursForWeek(userId: string, weekDates: Date[]): number {
    const h = hoursForUserWeek(userId, weekDates)
    // count working days in that week that fall in month
    const workingDaysInMonth = weekDates.filter((d) => {
      const ds = toDateStr(d)
      return allDatesInMonth.includes(ds) && d.getDay() !== 0 && d.getDay() !== 6
    }).length
    if (workingDaysInMonth === 0) return 0
    return h / workingDaysInMonth
  }

  const sortedUsers = userIds
    .map((id) => ({
      id,
      name:       userMeta[id]?.name ?? id,
      department: (userMeta[id]?.role ?? 'ops') as AgentRole,
    }))
    .sort((a, b) => monthHours(b.id) - monthHours(a.id))

  // Department rollup
  const deptMap = new Map<AgentRole, { hours: number; cost: number; people: Set<string> }>()
  for (const u of sortedUsers) {
    const prev = deptMap.get(u.department) ?? { hours: 0, cost: 0, people: new Set() }
    prev.hours += monthHours(u.id)
    prev.cost  += monthCost(u.id)
    prev.people.add(u.id)
    deptMap.set(u.department, prev)
  }

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12) }
    else setMonth(month - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1) }
    else setMonth(month + 1)
  }

  const colCount = 2 + weeks.length + 2  // name + dept + weeks + totalH + cost

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded-field hover:bg-line-soft text-ink-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-ink-700">{t('table.ymLabel', { year, month })}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-field hover:bg-line-soft text-ink-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Department summary chips */}
      {deptMap.size > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {Array.from(deptMap.entries())
            .sort((a, b) => b[1].hours - a[1].hours)
            .map(([dept, { hours, cost, people }]) => (
              <div key={dept} className="bg-surface border border-line rounded-field px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="font-medium text-ink-700">{DEPARTMENT_LABELS[dept]}</span>
                <span className="text-ink-400">·</span>
                <span className="text-ink-600 tabular-nums">{t('summary.participantsValue', { count: people.size })}</span>
                <span className="text-ink-400">·</span>
                <span className="text-ink-600 tabular-nums">{hours}h</span>
                <span className="text-ink-400">·</span>
                <span className="text-ink-600 tabular-nums">{fmtRmb(cost)}</span>
              </div>
            ))}
        </div>
      )}

      {/* Grid table — multi-column numeric comparison (design-system.md §6.1),
          Table primitive. Tfoot has no shared primitive yet (Table.tsx only
          exports Table/THead/TBody/Th/Tr/Td) so the totals row is a plain
          <tfoot> styled directly with tokens. */}
      <div className="bg-surface border border-line rounded-card overflow-hidden">
        <Table minWidth={720} label={t('table.ymLabel', { year, month })}>
          <THead>
            <Th className="w-32">{t('table.member')}</Th>
            <Th className="w-16">{t('table.department')}</Th>
            {weekLabels.map((wl, i) => (
              <Th key={i} align="center" className="w-28">
                <div>{t('table.weekN', { n: i + 1 })}</div>
                <div className="font-normal text-ink-400">{wl}</div>
              </Th>
            ))}
            <Th align="center" className="w-20">{t('table.monthHoursCol')}</Th>
            <Th align="center" className="w-24">{t('table.labourCostCol')}</Th>
          </THead>
          <TBody>
            {sortedUsers.length === 0 ? (
              <Tr>
                <Td colSpan={colCount} className="py-12 text-center text-ink-400">{t('emptyMonth')}</Td>
              </Tr>
            ) : (
              sortedUsers.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-primary-soft flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {u.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-medium text-ink-900 truncate">{u.name}</span>
                    </div>
                  </Td>
                  <Td className="text-ink-500">{DEPARTMENT_LABELS[u.department]}</Td>
                  {weeks.map((w, i) => {
                    const h    = hoursForUserWeek(u.id, w)
                    const avg  = avgDailyHoursForWeek(u.id, w)
                    return (
                      <Td key={i} align="center">
                        {h > 0 ? (
                          <span className={`font-semibold tabular-nums px-1.5 py-0.5 rounded-full ${utilisationColor(avg)}`}>
                            {h}h
                          </span>
                        ) : (
                          <span className="text-line-strong">—</span>
                        )}
                      </Td>
                    )
                  })}
                  <Td align="center">
                    <span className={`font-semibold tabular-nums px-2 py-0.5 rounded-full ${utilisationColor(monthHours(u.id) / 22)}`}>
                      {monthHours(u.id)}h
                    </span>
                  </Td>
                  <Td align="center" numeric>{fmtRmb(monthCost(u.id))}</Td>
                </Tr>
              ))
            )}
          </TBody>

          {/* Footer totals */}
          {sortedUsers.length > 0 && (
            <tfoot>
              <tr className="bg-canvas border-t border-line font-semibold">
                <td className="px-3 py-2 text-ink-600" colSpan={2}>{t('table.rowTotal')}</td>
                {weeks.map((w, i) => {
                  const total = sortedUsers.reduce((s, u) => s + hoursForUserWeek(u.id, w), 0)
                  return (
                    <td key={i} className="px-2 py-2 text-center text-ink-700 tabular-nums">
                      {total > 0 ? `${total}h` : '—'}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-center text-ink-700 tabular-nums">
                  {sortedUsers.reduce((s, u) => s + monthHours(u.id), 0)}h
                </td>
                <td className="px-3 py-2 text-center text-ink-700 tabular-nums">
                  {fmtRmb(sortedUsers.reduce((s, u) => s + monthCost(u.id), 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </Table>
      </div>

      {/* Quick-add buttons */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {weeks.map((w, i) => {
          const monday = toDateStr(w[0])
          return (
            <button
              key={i}
              onClick={() => setCreating(monday)}
              className="text-xs px-3 py-1.5 rounded-field border border-dashed border-line-strong text-ink-400 hover:border-primary-border hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
            >
              {t('table.addToWeek', { n: i + 1 })}
            </button>
          )
        })}
      </div>

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
