'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import WorkTaskForm from './WorkTaskForm'
import {
  DEPARTMENT_LABELS,
  utilisationColor,
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

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function fmtRmb(v: number) {
  return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function WorkloadWeekView({ tasks, salaryMap, userMeta, onRefresh }: Props) {
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
        <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-slate-700">{weekLabel}</span>
        <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Header row */}
        <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: '160px repeat(7, 1fr) 80px 80px' }}>
          <div className="px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50 border-r border-slate-100">成员</div>
          {weekDates.map((d, i) => {
            const ds = toDateStr(d)
            const isToday = ds === today
            return (
              <div
                key={ds}
                className={`px-2 py-2 text-center border-r border-slate-100 ${isToday ? 'bg-indigo-50' : 'bg-slate-50'}`}
              >
                <p className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>{DAY_LABELS[i]}</p>
                <p className={`text-xs ${isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                  {d.getMonth() + 1}/{d.getDate()}
                </p>
              </div>
            )
          })}
          <div className="px-2 py-2 text-center text-xs font-medium text-slate-500 bg-slate-50 border-r border-slate-100">总工时</div>
          <div className="px-2 py-2 text-center text-xs font-medium text-slate-500 bg-slate-50">人力成本</div>
        </div>

        {/* User rows */}
        {sortedUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">本周暂无任务</div>
        ) : (
          sortedUsers.map((u) => (
            <div
              key={u.id}
              className="grid border-b border-slate-100 last:border-b-0"
              style={{ gridTemplateColumns: '160px repeat(7, 1fr) 80px 80px' }}
            >
              {/* Name */}
              <div className="flex items-center gap-2 px-3 py-2 border-r border-slate-100">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{u.name}</p>
                  <p className="text-xs text-slate-400">{DEPARTMENT_LABELS[u.department as AgentRole]}</p>
                </div>
              </div>

              {/* Day cells */}
              {weekStrs.map((ds) => {
                const h    = hoursForUserDay(u.id, ds)
                const dayTasks = tasksForUserDay(u.id, ds)
                const isToday  = ds === today
                return (
                  <div
                    key={ds}
                    onClick={() => dayTasks.length > 0 && setDetail({ user: u.name, date: ds, tasks: dayTasks })}
                    className={`px-1 py-1.5 border-r border-slate-100 flex flex-col items-center justify-center gap-0.5 transition-colors
                      ${isToday ? 'bg-indigo-50/50' : ''}
                      ${dayTasks.length > 0 ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  >
                    {h > 0 ? (
                      <>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${utilisationColor(h)}`}>
                          {h}h
                        </span>
                        <span className="text-xs text-slate-400">{dayTasks.length}项</span>
                      </>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-100" />
                    )}
                  </div>
                )
              })}

              {/* Total hours */}
              <div className="flex items-center justify-center border-r border-slate-100">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${utilisationColor(weekHours(u.id) / 5)}`}>
                  {weekHours(u.id)}h
                </span>
              </div>

              {/* Weekly cost */}
              <div className="flex items-center justify-center">
                <span className="text-xs text-slate-600">{fmtRmb(weekCost(u.id))}</span>
              </div>
            </div>
          ))
        )}

        {/* Footer: daily totals */}
        {sortedUsers.length > 0 && (
          <div
            className="grid bg-slate-50 border-t border-slate-200"
            style={{ gridTemplateColumns: '160px repeat(7, 1fr) 80px 80px' }}
          >
            <div className="px-3 py-2 text-xs font-medium text-slate-500 border-r border-slate-100">日合计</div>
            {weekStrs.map((ds) => {
              const totalH = sortedUsers.reduce((s, u) => s + hoursForUserDay(u.id, ds), 0)
              return (
                <div key={ds} className="px-1 py-2 text-center border-r border-slate-100">
                  {totalH > 0 && (
                    <span className="text-xs font-medium text-slate-600">{totalH}h</span>
                  )}
                </div>
              )
            })}
            <div className="px-2 py-2 text-center">
              <span className="text-xs font-semibold text-slate-700">
                {sortedUsers.reduce((s, u) => s + weekHours(u.id), 0)}h
              </span>
            </div>
            <div className="px-2 py-2 text-center">
              <span className="text-xs font-semibold text-slate-700">
                {fmtRmb(sortedUsers.reduce((s, u) => s + weekCost(u.id), 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Quick add row */}
      <div className="flex gap-2 mt-3 flex-wrap">
        {weekDates.map((d) => {
          const ds = toDateStr(d)
          return (
            <button
              key={ds}
              onClick={() => setCreating(ds)}
              className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              + {d.getMonth() + 1}/{d.getDate()} 添加
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
            {detail.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                <span className="text-xs font-medium text-slate-600 flex-1">{t.title}</span>
                <span className="text-xs text-slate-400">{t.effort_hours}h</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  t.status === 'done' ? 'bg-green-100 text-green-700' :
                  t.status === 'doing' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{t.status === 'done' ? '已完成' : t.status === 'doing' ? '进行中' : '计划中'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Create modal */}
      <Modal open={!!creating} onClose={() => setCreating(null)} title="添加任务" width="max-w-2xl">
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
