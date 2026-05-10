'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import DeviceForm from '@/components/devices/DeviceForm'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Plus, Search, Laptop, RotateCcw } from 'lucide-react'
import type { Device, DevicePaymentStatus } from '@/lib/types'
import { DEVICE_PAYMENT_STATUS_OPTIONS, PAYMENT_STATUS_LABEL, getDeviceCostSummary } from '@/lib/devices/costs'

function fmtRmb(amount: number) {
  return '¥' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const STATUS_COLOR: Record<DevicePaymentStatus, string> = {
  budgeted:            'bg-slate-100 text-slate-600',
  ordered_unpaid:      'bg-amber-100 text-amber-700',
  paid:                'bg-green-100 text-green-700',
  refunded:            'bg-red-100 text-red-600',
  partially_refunded:  'bg-orange-100 text-orange-700',
}

interface Filters {
  q:                string
  payment_status:   string
  payment_method:   string
  user_name:        string
  buyer_name:       string
  purchase_location: string
  purpose:          string
  date_from:        string
  date_to:          string
}

const EMPTY_FILTERS: Filters = {
  q: '', payment_status: '', payment_method: '', user_name: '',
  buyer_name: '', purchase_location: '', purpose: '', date_from: '', date_to: '',
}

export default function DevicesPage() {
  const [devices,    setDevices]    = useState<Device[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [filters,    setFilters]    = useState<Filters>(EMPTY_FILTERS)
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState<Device | null>(null)
  const [deleting,   setDeleting]   = useState<Device | null>(null)
  const [deleteErr,  setDeleteErr]  = useState<string | null>(null)
  const [delLoading, setDelLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const res  = await fetch(`/api/devices?${params.toString()}`)
    const json = await res.json()
    setLoadError(json.error ?? null)
    setDevices(json.data ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const summary = getDeviceCostSummary(devices)

  const setFilter = (k: keyof Filters) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFilters((f) => ({ ...f, [k]: e.target.value }))

  const resetFilters = () => setFilters(EMPTY_FILTERS)

  async function confirmDelete() {
    if (!deleting) return
    setDelLoading(true)
    setDeleteErr(null)
    const res  = await fetch(`/api/devices/${deleting.id}`, { method: 'DELETE' })
    const json = await res.json()
    setDelLoading(false)
    if (json.error) { setDeleteErr(json.error); return }
    setDeleting(null)
    load()
  }

  const INPUT = 'border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div>
      <Header
        title="Device Management"
        subtitle={`${summary.deviceCount} device${summary.deviceCount !== 1 ? 's' : ''} tracked`}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Add Device
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Total Device Cost</p>
          <p className="text-xl font-bold text-slate-900">{fmtRmb(summary.totalCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Paid Cost</p>
          <p className="text-xl font-bold text-green-700">{fmtRmb(summary.paidCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Budgeted / Unpaid</p>
          <p className="text-xl font-bold text-amber-700">{fmtRmb(summary.budgetedUnpaidCost)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-1">Device Count</p>
          <p className="text-xl font-bold text-slate-900">{summary.deviceCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.q} onChange={setFilter('q')}
              placeholder="Search devices..."
              className={`pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52`}
            />
          </div>

          {/* Payment status */}
          <select value={filters.payment_status} onChange={setFilter('payment_status')} className={`${INPUT} w-44`}>
            <option value="">All Statuses</option>
            {DEVICE_PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Payment method */}
          <input value={filters.payment_method} onChange={setFilter('payment_method')}
            placeholder="Payment method" className={`${INPUT} w-36`} />

          {/* User */}
          <input value={filters.user_name} onChange={setFilter('user_name')}
            placeholder="User" className={`${INPUT} w-28`} />

          {/* Buyer */}
          <input value={filters.buyer_name} onChange={setFilter('buyer_name')}
            placeholder="Buyer" className={`${INPUT} w-28`} />

          {/* Location */}
          <input value={filters.purchase_location} onChange={setFilter('purchase_location')}
            placeholder="Location" className={`${INPUT} w-28`} />

          {/* Purpose */}
          <input value={filters.purpose} onChange={setFilter('purpose')}
            placeholder="Purpose" className={`${INPUT} w-28`} />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-500">Date:</label>
          <input type="date" value={filters.date_from} onChange={setFilter('date_from')} className={INPUT} />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={filters.date_to} onChange={setFilter('date_to')} className={INPUT} />
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading...</div>
        ) : loadError ? (
          <div className="p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </div>
          </div>
        ) : devices.length === 0 ? (
          <div className="p-12 text-center">
            <Laptop className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No devices found.</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-indigo-600 font-medium hover:underline">
              Add your first device
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Device Name</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Unit Price</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Qty</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Purchase Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Purpose</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">User</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Buyer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Payment Method</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{d.device_name}</td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">{fmtRmb(Number(d.unit_price))}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{d.quantity}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">{fmtRmb(Number(d.total_price))}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{d.purchase_date}</td>
                    <td className="px-4 py-3 text-slate-500">{d.purchase_location || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[140px] truncate">{d.purchase_purpose || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{d.user_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{d.buyer_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{d.payment_method || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[d.payment_status]}`}>
                        {PAYMENT_STATUS_LABEL[d.payment_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(d)}
                        className="text-xs text-indigo-600 font-medium hover:text-indigo-800 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setDeleting(d); setDeleteErr(null) }}
                        className="text-xs text-red-500 font-medium hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Device" width="max-w-2xl">
        <DeviceForm
          onSuccess={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Device" width="max-w-2xl">
        {editing && (
          <DeviceForm
            device={editing}
            onSuccess={() => { setEditing(null); load() }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Device">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Are you sure you want to delete <span className="font-semibold">{deleting.device_name}</span>?
              This action cannot be undone.
            </p>
            {deleteErr && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {deleteErr}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="danger" loading={delLoading} onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
