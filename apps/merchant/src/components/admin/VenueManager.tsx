'use client'

import { useState } from 'react'

import {
  upsertVenue,
  setVenueStatus,
  assignVenueRole,
  type VenueInput,
} from '@/lib/admin-actions'
import LocationPicker from './LocationPicker'

export type AdminVenue = {
  id: string
  name_ka: string
  name_en: string
  category: string
  status: 'pending' | 'approved' | 'suspended'
  subscription_tier: 'basic' | 'premium'
  max_vouchers_per_drop: number
  monthly_voucher_allowance: number
  address_en: string | null
  lat: number
  lng: number
  staff: Array<{ role: string; display_name: string | null }>
}

const CATEGORIES = ['cafe', 'bar', 'restaurant', 'bakery', 'salon', 'shop', 'other']

export default function VenueManager({ venues }: { venues: AdminVenue[] }) {
  const [editing, setEditing] = useState<AdminVenue | 'new' | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Venues</h1>
          <p className="mt-0.5 text-sm text-muted">
            {venues.length} total ·{' '}
            {venues.filter((v) => v.status === 'approved').length} approved
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-ink-soft"
        >
          Add venue
        </button>
      </div>

      {editing && (
        <VenueForm
          venue={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {venues.map((venue) => (
          <VenueRow key={venue.id} venue={venue} onEdit={() => setEditing(venue)} />
        ))}
        {venues.length === 0 && (
          <li className="p-8 text-center text-sm text-muted">
            No venues yet. Add the first one.
          </li>
        )}
      </ul>
    </div>
  )
}

function VenueRow({ venue, onEdit }: { venue: AdminVenue; onEdit: () => void }) {
  const [busy, setBusy] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'manager' | 'cashier'>('owner')
  const [error, setError] = useState<string | null>(null)

  async function change(status: 'approved' | 'suspended' | 'pending') {
    setBusy(true)
    setError(null)
    try {
      await setVenueStatus(venue.id, status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusDot status={venue.status} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{venue.name_en}</span>
            <span className="text-xs text-faint">{venue.name_ka}</span>
            {venue.subscription_tier === 'premium' && (
              <span className="rounded bg-warn px-1.5 py-0.5 text-[10px] font-bold uppercase text-warn-ink">
                Premium
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {venue.category} · {venue.lat.toFixed(5)}, {venue.lng.toFixed(5)} ·{' '}
            {venue.max_vouchers_per_drop}/drop · {venue.monthly_voucher_allowance}/month
            {venue.staff.length > 0 && (
              <>
                {' · '}
                {venue.staff.map((s) => `${s.display_name ?? '?'} (${s.role})`).join(', ')}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setAssigning((v) => !v)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-canvas"
          >
            Staff
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-canvas"
          >
            Edit
          </button>
          {venue.status !== 'approved' ? (
            <button
              onClick={() => change('approved')}
              disabled={busy}
              className="rounded-lg bg-live px-3 py-1.5 text-xs font-semibold text-live-ink disabled:opacity-40"
            >
              Approve
            </button>
          ) : (
            <button
              onClick={() => change('suspended')}
              disabled={busy}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-danger-ink disabled:opacity-40"
            >
              Suspend
            </button>
          )}
        </div>
      </div>

      {assigning && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              await assignVenueRole(venue.id, email, role)
              setEmail('')
              setAssigning(false)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed')
            }
          }}
        >
          <label className="flex-1 space-y-1">
            <span className="block text-xs text-muted">Account email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@cafe.ge"
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
            </select>
          </label>
          <button className="rounded-lg bg-ink px-4 py-1.5 text-sm font-semibold text-canvas">
            Assign
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
    </li>
  )
}

function StatusDot({ status }: { status: AdminVenue['status'] }) {
  const map = {
    approved: { bg: 'bg-live', text: 'text-live-ink', label: 'Live' },
    pending: { bg: 'bg-warn', text: 'text-warn-ink', label: 'Pending' },
    suspended: { bg: 'bg-danger', text: 'text-danger-ink', label: 'Suspended' },
  }[status]

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${map.bg} ${map.text}`}
    >
      {map.label}
    </span>
  )
}

function VenueForm({
  venue,
  onDone,
}: {
  venue: AdminVenue | null
  onDone: () => void
}) {
  const [values, setValues] = useState<VenueInput>({
    id: venue?.id,
    nameKa: venue?.name_ka ?? '',
    nameEn: venue?.name_en ?? '',
    category: venue?.category ?? 'cafe',
    lat: venue?.lat ?? 41.6998,
    lng: venue?.lng ?? 44.7935,
    addressEn: venue?.address_en ?? '',
    tier: venue?.subscription_tier ?? 'basic',
    maxPerDrop: venue?.max_vouchers_per_drop ?? 20,
    monthlyAllowance: venue?.monthly_voucher_allowance ?? 400,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="space-y-4 rounded-xl border border-line bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await upsertVenue(values)
          onDone()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2 className="text-sm font-semibold text-ink">
        {venue ? `Edit ${venue.name_en}` : 'New venue'}
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name (English)">
          <input
            required
            value={values.nameEn}
            onChange={(e) => setValues({ ...values, nameEn: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Name (Georgian)">
          <input
            required
            value={values.nameKa}
            onChange={(e) => setValues({ ...values, nameKa: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Category">
          <select
            value={values.category}
            onChange={(e) => setValues({ ...values, category: e.target.value })}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plan">
          <select
            value={values.tier}
            onChange={(e) =>
              setValues({ ...values, tier: e.target.value as 'basic' | 'premium' })
            }
            className={inputClass}
          >
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
          </select>
        </Field>
      </div>

      {/* Supply is set here and nowhere else. The merchant's drop form reads
          these numbers and the database refuses anything above them, so this
          is the only place the quantity of vouchers in the city is decided. */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-line-strong bg-canvas p-3">
        <Field label="Max vouchers per drop">
          <input
            type="number"
            min={1}
            max={500}
            required
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
            required
            value={values.monthlyAllowance}
            onChange={(e) =>
              setValues({ ...values, monthlyAllowance: Number(e.target.value) })
            }
            className={inputClass}
          />
        </Field>
        <p className="col-span-2 text-xs text-muted">
          The venue can schedule drops freely inside these limits and cannot
          exceed them. Counted against the month a drop starts in.
        </p>
      </div>

      <Field label="Address">
        <input
          value={values.addressEn ?? ''}
          onChange={(e) => setValues({ ...values, addressEn: e.target.value })}
          className={inputClass}
        />
      </Field>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">Location</span>
        <p className="text-xs text-muted">
          Click the map to place the pin. This is where drops appear, so players
          will physically walk here — put it on the pavement outside the door,
          not in the middle of the road.
        </p>
        <LocationPicker
          lat={values.lat}
          lng={values.lng}
          onChange={(lat, lng) => setValues({ ...values, lat, lng })}
        />
        <p className="text-xs tabular-nums text-faint">
          {values.lat.toFixed(6)}, {values.lng.toFixed(6)}
        </p>
      </div>

      {error && <p className="text-sm text-danger-ink">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted"
        >
          Cancel
        </button>
        <button
          disabled={busy}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save venue'}
        </button>
      </div>
    </form>
  )
}

const inputClass =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-indigo'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}
