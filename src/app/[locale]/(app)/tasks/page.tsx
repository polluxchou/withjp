'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import TaskCard from '@/components/tasks/TaskCard'
import Button from '@/components/ui/Button'
import WorkloadDayView from '@/components/work-tasks/WorkloadDayView'
import WorkloadWeekView from '@/components/work-tasks/WorkloadWeekView'
import WorkloadMonthView from '@/components/work-tasks/WorkloadMonthView'
import SalaryManager from '@/components/work-tasks/SalaryManager'
import { Play, RefreshCw, CheckSquare, Calendar, Settings } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toDateStr } from '@/lib/work-tasks/cost'
import type { Task, TaskStatus, WorkTask, AgentRole } from '@/lib/types'

const STATUS_TABS: (TaskStatus | 'all')[] = ['all', 'pending', 'running', 'done', 'failed']
type WorkloadPeriod = 'day' | 'week' | 'month'

export default function TasksPage() {
  // ── Tab A: AI tasks ────────────────────────────────────────────
  const [tasks,      setTasks]      = useState<Task[]>([])
  const [aiLoading,  setAiLoading]  = useState(true)
  const [filter,     setFilter]     = useState<TaskStatus | 'all'>('all')
  const [executing,  setExecuting]  = useState<string | null>(null)
  const t = useTranslations('tasks')
  const tCommon = useTranslations('common')

  // ── Tab B: Work tasks ──────────────────────────────────────────
  const [workTasks,  setWorkTasks]  = useState<WorkTask[]>([])
  const [salaryMap,  setSalaryMap]  = useState<Record<string, number>>({})
  const [userMeta,   setUserMeta]   = useState<Record<string, { name: string; user_code: string; role: AgentRole }>>({})
  const [wlLoading,  setWlLoading]  = useState(false)
  const [period,     setPeriod]     = useState<WorkloadPeriod>('day')
  const [dayDate,    setDayDate]    = useState(toDateStr(new Date()))
  const [showSalary, setShowSalary] = useState(false)

  // ── Main tab ───────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<'ai' | 'workload'>('workload')

  // ── AI tasks load ──────────────────────────────────────────────
  const loadAI = useCallback(async () => {
    setAiLoading(true)
    try {
      const url = filter === 'all' ? '/api/tasks' : `/api/tasks?status=${filter}`
      const res  = await fetch(url)
      const json = await res.json()
      setTasks(json.data ?? [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setTasks([])
    } finally {
      setAiLoading(false)
    }
  }, [filter])

  useEffect(() => { if (mainTab === 'ai') loadAI() }, [loadAI, mainTab])

  // ── Work tasks load ────────────────────────────────────────────
  const loadWorkloads = useCallback(async () => {
    setWlLoading(true)
    try {
      // Build date range based on period
      let url = '/api/work-tasks?'
      if (period === 'day') {
        url += `date=${dayDate}`
      } else if (period === 'week') {
        url += 'date_from=1970-01-01&date_to=2099-12-31'  // let the component filter by week
      } else {
        url += 'date_from=1970-01-01&date_to=2099-12-31'  // let the component filter by month
      }

      const [wt, sal, usr] = await Promise.all([
        fetch(url).then((r) => r.json()),
        fetch('/api/user-salary?current=true').then((r) => r.json()),
        fetch('/api/users').then((r) => r.json()),
      ])

      setWorkTasks(wt.data ?? [])

      // Build salary map: user_id → monthly_salary
      const sm: Record<string, number> = {}
      for (const s of (sal.data ?? [])) {
        sm[s.user_id] = s.monthly_salary
      }
      setSalaryMap(sm)

      // Build user meta map
      const um: Record<string, { name: string; user_code: string; role: AgentRole }> = {}
      for (const u of (usr.data ?? [])) {
        um[u.id] = { name: u.name, user_code: u.user_code, role: u.role }
      }
      setUserMeta(um)
    } catch (err) {
      console.error('Failed to load workloads:', err)
    } finally {
      setWlLoading(false)
    }
  }, [period, dayDate])

  useEffect(() => { if (mainTab === 'workload') loadWorkloads() }, [loadWorkloads, mainTab])

  async function executeTask(taskId: string) {
    setExecuting(taskId)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'execute' }),
    })
    await loadAI()
    setExecuting(null)
  }

  const counts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    running: tasks.filter((t) => t.status === 'running').length,
    done:    tasks.filter((t) => t.status === 'done').length,
    failed:  tasks.filter((t) => t.status === 'failed').length,
  }

  return (
    <div>
      <Header
        title="任务中心"
        subtitle="管理 AI 任务流程与团队工时"
        actions={
          <div className="flex items-center gap-2">
            {mainTab === 'workload' && (
              <Button variant="secondary" size="sm" onClick={() => setShowSalary(true)}>
                <Settings className="w-3.5 h-3.5" /> 薪资设置
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => mainTab === 'ai' ? loadAI() : loadWorkloads()}
            >
              <RefreshCw className="w-3.5 h-3.5" /> {tCommon('refresh')}
            </Button>
          </div>
        }
      />

      {/* Main tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
        {([
          { key: 'workload', label: '工时视图', icon: Calendar },
          { key: 'ai',       label: 'AI 任务',  icon: CheckSquare },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              mainTab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab A: AI Tasks ── */}
      {mainTab === 'ai' && (
        <>
          {/* Status tabs */}
          <div className="flex items-center gap-1.5 mb-5">
            {STATUS_TABS.map((key) => {
              const count = key === 'all' ? tasks.length : counts[key as TaskStatus]
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    filter === key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {key === 'all' ? tCommon('all') : t(key)}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${filter === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {aiLoading ? (
            <div className="text-center py-12 text-sm text-slate-400">{tCommon('loading')}</div>
          ) : tasks.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t('noTasksInView')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div key={task.id}>
                  <TaskCard task={task} />
                  {task.status === 'pending' && (
                    <div className="pl-7 pt-1.5">
                      <Button
                        size="sm"
                        loading={executing === task.id}
                        onClick={() => executeTask(task.id)}
                      >
                        <Play className="w-3 h-3" />
                        {tCommon('run')} {task.agent?.name ?? t('agent')}
                      </Button>
                    </div>
                  )}
                  {task.status === 'done' && task.output && (
                    <details className="pl-7 pt-1">
                      <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">{t('viewOutput')}</summary>
                      <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-48 text-slate-700">
                        {JSON.stringify(task.output, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab B: Workload ── */}
      {mainTab === 'workload' && (
        <>
          {/* Period selector + day date picker */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              {(['day', 'week', 'month'] as WorkloadPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    period === p
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p === 'day' ? '日' : p === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>

            {period === 'day' && (
              <input
                type="date"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>

          {wlLoading ? (
            <div className="text-center py-12 text-sm text-slate-400">加载中…</div>
          ) : (
            <>
              {period === 'day'   && (
                <WorkloadDayView
                  tasks={workTasks}
                  salaryMap={salaryMap}
                  userMeta={userMeta}
                  date={dayDate}
                  onRefresh={loadWorkloads}
                />
              )}
              {period === 'week'  && (
                <WorkloadWeekView
                  tasks={workTasks}
                  salaryMap={salaryMap}
                  userMeta={userMeta}
                  onRefresh={loadWorkloads}
                />
              )}
              {period === 'month' && (
                <WorkloadMonthView
                  tasks={workTasks}
                  salaryMap={salaryMap}
                  userMeta={userMeta}
                  onRefresh={loadWorkloads}
                />
              )}
            </>
          )}

          {/* Salary Manager drawer */}
          {showSalary && (
            <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setShowSalary(false)}>
              <div
                className="w-full max-w-3xl bg-white h-full overflow-y-auto p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-slate-900">薪资管理</h2>
                  <button
                    onClick={() => setShowSalary(false)}
                    className="text-slate-400 hover:text-slate-700 transition-colors text-sm"
                  >
                    关闭
                  </button>
                </div>
                <SalaryManager />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
