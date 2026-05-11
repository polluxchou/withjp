'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import TaskCard from '@/components/tasks/TaskCard'
import Button from '@/components/ui/Button'
import { Play, RefreshCw, CheckSquare } from 'lucide-react'
import type { Task, TaskStatus } from '@/lib/types'

const STATUS_TABS: { key: TaskStatus | 'all'; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'running', label: 'Running' },
  { key: 'done',    label: 'Done' },
  { key: 'failed',  label: 'Failed' },
]

export default function TasksPage() {
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<TaskStatus | 'all'>('all')
  const [executing,setExecuting]= useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter === 'all' ? '/api/tasks' : `/api/tasks?status=${filter}`
      const res  = await fetch(url)
      const json = await res.json()
      setTasks(json.data ?? [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function executeTask(taskId: string) {
    setExecuting(taskId)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'execute' }),
    })
    await load()
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
        title="Tasks Center"
        subtitle="All agent tasks across all creators"
        actions={
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        }
      />

      {/* Status tabs */}
      <div className="flex items-center gap-1.5 mb-5">
        {STATUS_TABS.map(({ key, label }) => {
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
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${filter === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No tasks in this view.</p>
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
                    Run {task.agent?.name ?? 'Agent'}
                  </Button>
                </div>
              )}
              {task.status === 'done' && task.output && (
                <details className="pl-7 pt-1">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">View structured output</summary>
                  <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-48 text-slate-700">
                    {JSON.stringify(task.output, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
