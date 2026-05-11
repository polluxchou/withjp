'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { AgentRole } from '@/lib/types'
import { DEPARTMENT_LABELS } from '@/lib/work-tasks/cost'

interface SalaryRecord {
  id:             string
  user_id:        string
  monthly_salary: number
  effective_from: string
  effective_to:   string | null
  notes:          string | null
  user: {
    id:        string
    name:      string
    user_code: string
    role:      AgentRole
  }
}

interface UserOption { id: string; name: string; user_code: string; role: AgentRole }

function fmtRmb(v: number) {
  return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function SalaryManager() {
  const [records,  setRecords]  = useState<SalaryRecord[]>([])
  const [users,    setUsers]    = useState<UserOption[]>([])
  const [loading,  setLoading]  = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing,  setEditing]  = useState<SalaryRecord | null>(null)
  const [deleting, setDeleting] = useState<SalaryRecord | null>(null)
  const [delLoading, setDelLoading] = useState(false)

  const [form, setForm] = useState({
    user_id:        '',
    monthly_salary: '',
    effective_from: '',
    effective_to:   '',
    notes:          '',
  })
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [sr, ur] = await Promise.all([
      fetch('/api/user-salary').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ])
    setRecords(sr.data ?? [])
    setUsers(ur.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm({ user_id: '', monthly_salary: '', effective_from: '', effective_to: '', notes: '' })
    setFormError(null)
    setCreating(true)
  }

  function openEdit(r: SalaryRecord) {
    setForm({
      user_id:        r.user_id,
      monthly_salary: String(r.monthly_salary),
      effective_from: r.effective_from,
      effective_to:   r.effective_to ?? '',
      notes:          r.notes ?? '',
    })
    setFormError(null)
    setEditing(r)
  }

  async function handleSave() {
    if (!form.user_id)         { setFormError('请选择员工'); return }
    if (!form.monthly_salary)  { setFormError('请输入月薪'); return }
    if (!form.effective_from)  { setFormError('请输入生效日期'); return }
    if (Number(form.monthly_salary) < 0) { setFormError('月薪不能为负数'); return }

    setSaving(true)
    setFormError(null)

    const payload = {
      user_id:        form.user_id,
      monthly_salary: Number(form.monthly_salary),
      effective_from: form.effective_from,
      effective_to:   form.effective_to || null,
      notes:          form.notes || null,
    }

    let res
    if (editing) {
      res = await fetch(`/api/user-salary/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      res = await fetch('/api/user-salary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    const json = await res.json()
    setSaving(false)

    if (json.error) { setFormError(json.error); return }

    setCreating(false)
    setEditing(null)
    load()
  }

  async function handleDelete() {
    if (!deleting) return
    setDelLoading(true)
    await fetch(`/api/user-salary/${deleting.id}`, { method: 'DELETE' })
    setDelLoading(false)
    setDeleting(null)
    load()
  }

  // Group by user
  const byUser = new Map<string, SalaryRecord[]>()
  for (const r of records) {
    const prev = byUser.get(r.user_id) ?? []
    byUser.set(r.user_id, [...prev, r])
  }

  const INPUT = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const LABEL = 'block text-xs font-medium text-slate-700 mb-1'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">员工薪资管理</h3>
          <p className="text-xs text-slate-500 mt-0.5">薪资记录用于计算每个任务对应的人力成本</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> 添加薪资记录
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">加载中…</div>
      ) : records.length === 0 ? (
        <div className="py-12 text-center bg-white border border-slate-200 rounded-xl">
          <p className="text-sm text-slate-400">暂无薪资记录</p>
          <p className="text-xs text-slate-300 mt-1">添加员工薪资后才能准确计算人力成本</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">员工</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">部门</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">月薪</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">生效日期</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">截止日期</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">备注</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => {
                const isCurrent = !r.effective_to
                return (
                  <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${isCurrent ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                          {r.user.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900">{r.user.name}</span>
                        {isCurrent && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">当前</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {DEPARTMENT_LABELS[r.user.role]}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                      {fmtRmb(r.monthly_salary)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.effective_from}</td>
                    <td className="px-4 py-2.5 text-slate-400">{r.effective_to ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-400 max-w-[160px] truncate">{r.notes ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleting(r)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null) }}
        title={editing ? '编辑薪资记录' : '添加薪资记录'}
      >
        <div className="space-y-4">
          {formError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>员工 *</label>
              <select
                value={form.user_id}
                onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
                className={INPUT}
                disabled={!!editing}
              >
                <option value="">请选择员工</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({DEPARTMENT_LABELS[u.role]})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>月薪（元）*</label>
              <input
                type="number"
                min={0}
                value={form.monthly_salary}
                onChange={(e) => setForm((f) => ({ ...f, monthly_salary: e.target.value }))}
                placeholder="例如 15000"
                className={INPUT}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>生效日期 *</label>
              <input
                type="date"
                value={form.effective_from}
                onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>截止日期（留空表示当前有效）</label>
              <input
                type="date"
                value={form.effective_to}
                onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>备注</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="可选备注"
              className={INPUT}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setCreating(false); setEditing(null) }}>取消</Button>
            <Button loading={saving} onClick={handleSave}>
              {editing ? '保存更改' : '添加记录'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="确认删除">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              确认删除 <span className="font-semibold">{deleting.user.name}</span> 的薪资记录（生效：{deleting.effective_from}）？
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
