'use client'

import { useState } from 'react'
import { Copy, Edit2, Trash2, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import WorkTaskForm from './WorkTaskForm'
import {
  WORK_TASK_TYPE_LABELS,
  WORK_TASK_STATUS_LABELS,
  DEPARTMENT_LABELS,
  utilisationColor,
  buildUserWorkloads,
  aggregateWorkload,
  toDateStr,
  WORKING_HOURS_PER_DAY,
} from '@/lib/work-tasks/cost'
import type { WorkTask, AgentRole, UserWorkload } from '@/lib/types'

interface Props {
  tasks:      WorkTask[]
  salaryMap:  Record<string, number>
  userMeta:   Record<string, { name: string; user_code: string; role: AgentRole }>
  date:       string
  onRefresh:  () => void
}

const STATUS_COLOR: Record<string, string> = {
  planned:   'bg-slate-100 text-slate-600',
  doing:     'bg-blue-100 text-blue-700',
  done:      'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
}

const TYPE_COLOR: Record<string, string> = {
  fixed: 'bg-amber-100 text-amber-700',
  adhoc: 'bg-purple-100 text-purple-700',
}

function fmtRmb(v: number) {
  return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function WorkloadDayView({ tasks, salaryMap, userMeta, date, onRefresh }: Props) {
  const [editing,   setEditing]   = useState<WorkTask | null>(null)
  const [creating,  setCreating]  = useState(false)
  const [dupTarget, setDupTarget] = useState<WorkTask | null>(null)
  const [dupDate,   setDupDate]   = useState('')
  const [deleting,  setDeleting]  = useState<WorkTask | null>(null)
  const [delLoading,setDelLoading]= useState(false)

  const workloads = buildUserWorkloads(tasks, salaryMap, userMeta)
  const summary   = aggregateWorkload(tasks, salaryMap)

  async function handleDelete() {
    if (!deleting) return
    setDelLoading(true)
    await fetch(`/api/work-tasks/${deleting.id}`, { method: 'DELETE' })
    setDelLoading(false)
    setDeleting(null)
    onRefresh()
  }

  async function handleDuplicate() {
    if (!dupTarget || !dupDate) return
    await fetch(`/api/work-tasks/${dupTarget.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_date: dupDate }),
    })
    setDupTarget(null)
    setDupDate('')
    onRefresh()
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: '总工时', value: `${summary.totalHours}h` },
          { label: '参与人数', value: `${summary.totalPeople}人` },
          { label: '人力成本', value: fmtRmb(summary.totalLabourCost) },
          { label: '任务数', value: `${tasks.filter(t => t.status !== 'cancelled').length}个` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            <p className="text-lg font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Department summary */}
      {Object.keys(summary.byDepartment).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {(Object.entries(summary.byDepartment) as [AgentRole, { hours: number; cost: number }][])
            .sort((a, b) => b[1].hours - a[1].hours)
            .map(([dept, { hours, cost }]) => (
              <div key={dept} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-medium text-slate-700">{DEPARTMENT_LABELS[dept]}</span>
                <span className="text-slate-400 mx-1">·</span>
                <span className="text-slate-600">{hours}h</span>
                <span className="text-slate-400 mx-1">·</span>
                <span className="text-slate-600">{fmtRmb(cost)}</span>
              </div>
            ))}
        </div>
      )}

      {/* Add button */}
      <div className="flex justify-end mb-3">
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> 添加任务
        </Button>
      </div>

      {/* Per-person rows */}
      {workloads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-400">
          当天暂无任务
        </div>
      ) : (
        <div className="space-y-3">
          {workloads.map((row) => (
            <div key={row.user_id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Person header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                  {row.user_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-slate-900">{row.user_name}</span>
                  <span className="ml-2 text-xs text-slate-400">{DEPARTMENT_LABELS[row.department]}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Utilisation bar */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: WORKING_HOURS_PER_DAY }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-sm ${i < row.total_hours ? 'bg-indigo-500' : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${utilisationColor(row.total_hours)}`}>
                    {row.total_hours}h
                  </span>
                  <span className="text-xs text-slate-400">{fmtRmb(row.daily_cost * (row.total_hours / WORKING_HOURS_PER_DAY))}</span>
                </div>
              </div>

              {/* Task list */}
              <div className="divide-y divide-slate-50">
                {row.tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex gap-1.5 mt-0.5 flex-shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLOR[t.task_type]}`}>
                        {WORK_TASK_TYPE_LABELS[t.task_type]}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLOR[t.status]}`}>
                        {WORK_TASK_STATUS_LABELS[t.status]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                      {t.milestone && (
                        <p className="text-xs text-slate-400 mt-0.5">🎯 {t.milestone.title}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                      <span className="font-medium text-slate-600">{t.effort_hours}h</span>
                      <span>·</span>
                      <span>{t.owner_user_id === row.user_id ? '负责人' : '执行人'}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setDupTarget(t); setDupDate('') }}
                        className="p-1 text-slate-400 hover:text-indigo-600 transition-colors" title="复制到">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditing(t)}
                        className="p-1 text-slate-400 hover:text-slate-700 transition-colors" title="编辑">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleting(t)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="添加任务" width="max-w-2xl">
        <WorkTaskForm
          defaultDate={date}
          onSuccess={() => { setCreating(false); onRefresh() }}
          onCancel={() => setCreating(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="编辑任务" width="max-w-2xl">
        {editing && (
          <WorkTaskForm
            task={editing}
            onSuccess={() => { setEditing(null); onRefresh() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Duplicate Modal */}
      <Modal open={!!dupTarget} onClose={() => setDupTarget(null)} title="复制任务到">
        {dupTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              将「<span className="font-medium">{dupTarget.title}</span>」复制到：
            </p>
            <input type="date" value={dupDate} onChange={(e) => setDupDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDupTarget(null)}>取消</Button>
              <Button onClick={handleDuplicate} disabled={!dupDate}>确认复制</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="确认删除">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              确认删除任务「<span className="font-semibold">{deleting.title}</span>」？
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button>
              <Button variant="danger" loading={delLoading} onClick={handleDelete}>删除</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
