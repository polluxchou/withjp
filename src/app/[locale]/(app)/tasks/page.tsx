'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import TaskCard from '@/components/tasks/TaskCard'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { Field, Input } from '@/components/ui/Field'
import { CountChip } from '@/components/ui/FilterChip'
import LoadingState from '@/components/ui/LoadingState'
import ErrorState from '@/components/ui/ErrorState'
import EmptyState from '@/components/ui/EmptyState'
import WorkloadDayView from '@/components/work-tasks/WorkloadDayView'
import WorkloadWeekView from '@/components/work-tasks/WorkloadWeekView'
import WorkloadMonthView from '@/components/work-tasks/WorkloadMonthView'
import SalaryManager from '@/components/work-tasks/SalaryManager'
import { Play, RefreshCw, CheckSquare, Settings, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toDateStr } from '@/lib/work-tasks/cost'
import { toneOf } from '@/lib/ui/status-tone'
import type { Task, TaskStatus, WorkTask, AgentRole } from '@/lib/types'

const STATUS_TABS: (TaskStatus | 'all')[] = ['all', 'pending', 'running', 'done', 'failed']
type WorkloadPeriod = 'day' | 'week' | 'month'

export default function TasksPage() {
  // ── Tab A: AI tasks ────────────────────────────────────────────
  const [tasks,      setTasks]      = useState<Task[]>([])
  const [aiLoading,  setAiLoading]  = useState(true)
  const [aiError,    setAiError]    = useState<string | null>(null)
  const [filter,     setFilter]     = useState<TaskStatus | 'all'>('all')
  const [executing,  setExecuting]  = useState<string | null>(null)
  const t = useTranslations('tasks')
  const tCommon = useTranslations('common')

  // ── Tab B: Work tasks ──────────────────────────────────────────
  const [workTasks,  setWorkTasks]  = useState<WorkTask[]>([])
  const [salaryMap,  setSalaryMap]  = useState<Record<string, number>>({})
  const [userMeta,   setUserMeta]   = useState<Record<string, { name: string; user_code: string; role: AgentRole }>>({})
  const [wlLoading,  setWlLoading]  = useState(false)
  const [wlError,    setWlError]    = useState<string | null>(null)
  const [period,     setPeriod]     = useState<WorkloadPeriod>('day')
  const [dayDate,    setDayDate]    = useState(toDateStr(new Date()))
  const [showSalary, setShowSalary] = useState(false)

  // ── Main tab ───────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<'ai' | 'workload'>('workload')

  // ── AI tasks load ──────────────────────────────────────────────
  // Same error-surfacing idiom as creators/pipeline pages (design-system.md
  // §6.3 三态): a non-ok response or thrown error now reaches aiError/ErrorState
  // instead of silently resolving to an empty list.
  const loadAI = useCallback(async () => {
    setAiLoading(true)
    try {
      const url = filter === 'all' ? '/api/tasks' : `/api/tasks?status=${filter}`
      const res  = await fetch(url)
      if (!res.ok) {
        console.error('Failed to load tasks:', res.status)
        throw new Error(tCommon('loadFailed'))
      }
      const json = await res.json()
      setAiError(json.error ?? null)
      setTasks(json.data ?? [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setAiError(err instanceof Error ? err.message : tCommon('loadFailed'))
      setTasks([])
    } finally {
      setAiLoading(false)
    }
  }, [filter])

  useEffect(() => { if (mainTab === 'ai') loadAI() }, [loadAI, mainTab])

  // ── Work tasks load ────────────────────────────────────────────
  const loadWorkloads = useCallback(async () => {
    setWlLoading(true)
    setWlError(null)
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
      setWlError(err instanceof Error ? err.message : tCommon('loadFailed'))
    } finally {
      setWlLoading(false)
    }
  }, [period, dayDate])

  useEffect(() => { if (mainTab === 'workload') loadWorkloads() }, [loadWorkloads, mainTab])

  // Close the salary drawer on Escape — lightweight equivalent of Modal's own
  // Escape handling (design-system.md §6.2), without pulling in its full
  // portal/focus-trap machinery for what stays a bespoke side drawer (see
  // the drawer decision note below).
  useEffect(() => {
    if (!showSalary) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSalary(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSalary])

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

  const aiState = aiLoading ? (
    <LoadingState variant="plain" />
  ) : aiError ? (
    <ErrorState title={tCommon('errorTitle')} detail={aiError} onRetry={loadAI} />
  ) : tasks.length === 0 ? (
    <EmptyState icon={<CheckSquare />} title={t('noTasksInView')} />
  ) : null

  const workloadState = wlLoading ? (
    <LoadingState variant="plain" />
  ) : wlError ? (
    <ErrorState title={tCommon('errorTitle')} detail={wlError} onRetry={loadWorkloads} />
  ) : null

  return (
    <div>
      <Header
        title={t('title')}
        subtitle={t('subtitle')}
        tabs={
          <Tabs
            items={[
              { value: 'workload', label: t('tabWorkload') },
              { value: 'ai',       label: t('tabAi') },
            ]}
            value={mainTab}
            onChange={(v) => setMainTab(v as 'ai' | 'workload')}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            {mainTab === 'workload' && (
              <Button variant="secondary" size="sm" onClick={() => setShowSalary(true)}>
                <Settings className="w-3.5 h-3.5" /> {t('salarySettings')}
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

      {/* ── Tab A: AI Tasks ── */}
      {mainTab === 'ai' && (
        <>
          {/* Status filter — same CountChip idiom as expenses/creators pages
              (design-system.md §6.1 "列表页顶部状态过滤"). */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {STATUS_TABS.map((key) => (
              <CountChip
                key={key}
                label={key === 'all' ? tCommon('all') : t(key)}
                count={key === 'all' ? tasks.length : counts[key as TaskStatus]}
                tone={key === 'all' ? 'neutral' : toneOf('task', key)}
                active={filter === key}
                onClick={() => setFilter(key)}
              />
            ))}
          </div>

          {aiState ?? (
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
                      <summary className="text-xs text-ink-400 cursor-pointer hover:text-ink-700">{t('viewOutput')}</summary>
                      <pre className="mt-2 text-xs font-mono bg-canvas border border-line rounded-field p-3 overflow-auto max-h-48 text-ink-700">
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
          <div className="flex items-end gap-3 mb-4">
            <SegmentedControl
              items={[
                { value: 'day',   label: t('periodDay') },
                { value: 'week',  label: t('periodWeek') },
                { value: 'month', label: t('periodMonth') },
              ]}
              value={period}
              onChange={(v) => setPeriod(v as WorkloadPeriod)}
              label={t('periodGroupLabel')}
            />

            {period === 'day' && (
              <div className="w-40">
                <Field label={t('selectDate')}>
                  <Input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          {workloadState ?? (
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

          {/* Salary Manager drawer — a right-side slide-in panel, not a centered
              dialog, so it deliberately keeps its own bespoke structure rather
              than the shared Modal (design-system.md §6.1 lists Modal as
              "阻断式编辑/确认"; this is closer to the DiscussionPanel-style side
              context slot). Tokenised to match: backdrop z-40 / panel z-50 per
              the z-index table (§3), same split as Sidebar's mobile drawer. */}
          {showSalary && (
            <>
              <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={() => setShowSalary(false)}
                aria-hidden="true"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t('salaryManagement')}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl bg-surface shadow-pop overflow-y-auto p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-ink-900 tracking-title">{t('salaryManagement')}</h2>
                  <button
                    type="button"
                    aria-label={tCommon('close')}
                    onClick={() => setShowSalary(false)}
                    className="flex-none w-9 h-9 rounded-field flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:ring-offset-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <SalaryManager />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
