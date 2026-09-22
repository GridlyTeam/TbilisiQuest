'use client'

import { useState } from 'react'

import {
  approveApplication,
  rejectApplication,
  type AdminApplication,
} from '@/lib/apply-actions'
import LocationPicker from './LocationPicker'

/**
 * Businesses asking to join.
 *
 * Approving is not a single button, because approval creates the venue — and
 * the two things only an operator may decide, where the pin goes and how many
 * vouchers the venue may issue, have to be set here. The merchant's address is
 * a sentence they typed; the pin is where the app will actually send someone.
 */
export default function ApplicationQueue({
  initial,
}: {
  initial: AdminApplication[]
}) {
  const [rows, setRows] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)

  const pending = rows.filter((r) => r.app_status === 'pending')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Applications</h1>
        <p className="mt-0.5 text-sm text-muted">{pending.length} waiting</p>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`rounded-xl border border-line bg-surface p-4 ${
              row.app_status === 'pending' ? '' : 'opacity-60'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">
                {row.business_name}
              </span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold capitalize text-muted">
                {row.category}
              </span>
              {row.app_status !== 'pending' && (
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold capitalize text-muted">
                  {row.app_status}
                </span>
              )}
              <span className="ml-auto text-xs text-faint">{row.email}</span>
            </div>

            <p className="mt-2 text-sm text-muted">
              {row.address}
              {row.phone ? ` · ${row.phone}` : ''}
            </p>

            {row.note && (
              <p className="mt-2 text-sm leading-relaxed text-ink">{row.note}</p>
            )}

            {row.app_status === 'pending' && (
              <div className="mt-3">
                {openId === row.id ? (
                  <ApproveForm
                    application={row}
                    onCancel={() => setOpenId(null)}
                    onDone={(status) => {
                      setOpenId(null)
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, app_status: status } : r,
                        ),
                      )
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setOpenId(row.id)}
                    className="rounded-lg bg-indigo px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Review
                  </button>
                )}
              </div>
            )}
          </li>
        ))}

        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
            No applications yet.
          </li>
        )}
      </ul>
    </div>
  )
}

function ApproveForm({
  application,
  onDone,
  onCancel,
}: {
  application: AdminApplication
  onDone: (status: 'approved' | 'rejected') => void
  onCancel: () => void
}) {
  const [values, setValues] = useState({
    nameEn: application.business_name,
    nameKa: application.business_name,
    category: application.category,
    lat: 41.6998,
    lng: 44.7935,
    addressEn: application.address,
    tier: 'basic' as 'basic' | 'premium',
    maxPerDrop: 20,
    monthlyAllowance: 400,
  })
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      if (action === 'approve') {
        await approveApplication({ applicationId: application.id, ...values })
        onDone('approved')
      } else {
        await rejectApplication(application.id, notes || undefined)
        onDone('rejected')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line-strong bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (English)">
          <input
            value={values.nameEn}
            onChange={(e) => setValues({ ...values, nameEn: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Name (Georgian)">
          <input
            value={values.nameKa}
            onChange={(e) => setValues({ ...values, nameKa: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Max vouchers per drop">
          <input
            type="number"
            min={1}
            max={500}
            value={values.maxPerDrop}
            onChange={(e) =>
              setValues({ ...values, maxPerDrop: Number(e.target.value) })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Monthly allowance">
          <input
            type="number"
            min={1}
            max={20000}
            value={values.monthlyAllowance}
            onChange={(e) =>
              setValues({ ...values, monthlyAllowance: Number(e.target.value) })
            }
            className={inputClass}
          />
        </Field>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted">
          Place the pin — they gave this address: {application.address}
        </p>
        <LocationPicker
          lat={values.lat}
          lng={values.lng}
          onChange={(lat, lng) => setValues({ ...values, lat, lng })}
        />
        <p className="mt-1 text-xs tabular-nums text-faint">
          {values.lat.toFixed(6)}, {values.lng.toFixed(6)}
        </p>
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Note (sent with a rejection)"
        className={inputClass}
      />

      {error && <p className="text-xs text-danger-ink">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run('approve')}
          disabled={busy}
          className="rounded-lg bg-live px-3 py-1.5 text-xs font-semibold text-live-ink disabled:opacity-40"
        >
          Approve and create venue
        </button>
        <button
          onClick={() => run('reject')}
          disabled={busy}
          className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-danger-ink disabled:opacity-40"
        >
          Reject
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-neutral-900'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
