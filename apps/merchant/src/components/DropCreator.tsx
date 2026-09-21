'use client'

/**
 * DropCreator
 *
 * The merchant's main authoring surface: schedule a time-gated voucher drop
 * with a hard inventory cap.
 *
 * Two things drive the design:
 *
 *   1. The whole product exists to fill dead hours, so the form leads with
 *      off-peak presets rather than a blank time picker. A cafe owner should be
 *      able to schedule "20 coffees at half price, 14:00-17:00" in four taps.
 *
 *   2. Inventory cap is a financial commitment, not a preference. A Legendary
 *      drop with the cap left at a default could give away real money, so the
 *      form shows projected worst-case cost continuously and requires explicit
 *      confirmation above a threshold.
 */

import { useMemo, useState } from 'react'
import { z } from 'zod'

import { createDrop } from '../lib/actions'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
// Mirrors the CHECK constraints in the database. The DB is the real authority;
// this exists so the merchant gets feedback before a round trip.
const dropSchema = z
  .object({
    titleKa: z.string().min(2, 'Georgian title is required'),
    titleEn: z.string().min(2, 'English title is required'),
    descriptionKa: z.string().max(280).optional(),
    descriptionEn: z.string().max(280).optional(),
    rarity: z.enum(['common', 'rare', 'legendary']),
    offer: z.enum(['percent_off', 'bogo', 'free_item']),
    discountPercent: z.number().int().min(1).max(100).optional(),
    faceValueGel: z.number().min(0).max(10000),
    date: z.string().min(1, 'Pick a date'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    inventoryCap: z.number().int().min(1).max(500),
    earlyAccessLevel: z.number().int().min(0).max(15),
    earlyAccessMinutes: z.number().int().min(0).max(120),
    isBossChest: z.boolean(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  })
  .refine((v) => v.offer !== 'percent_off' || v.discountPercent != null, {
    message: 'Set a discount percentage',
    path: ['discountPercent'],
  })

export type DropFormValues = z.infer<typeof dropSchema>

// ---------------------------------------------------------------------------
// Off-peak presets
// ---------------------------------------------------------------------------
const OFF_PEAK_PRESETS = [
  { key: 'afternoon', label: 'Afternoon lull', start: '14:00', end: '17:00' },
  { key: 'morning', label: 'Late morning', start: '10:00', end: '12:00' },
  { key: 'lateEvening', label: 'Late evening', start: '21:00', end: '23:00' },
] as const

const RARITY_META = {
  common: { label: 'Common', hint: 'Small percentage off', accent: '#7c8b9a' },
  rare: { label: 'Rare', hint: 'Buy one get one free', accent: '#4a8fd4' },
  legendary: { label: 'Legendary', hint: 'Free item or major deal', accent: '#e8a33d' },
} as const

// Above this projected giveaway we make the merchant confirm explicitly.
const CONFIRM_THRESHOLD_GEL = 500

type Props = {
  venueId: string
  venueTimezone: string
  subscriptionTier: 'basic' | 'premium'
  onCreated?: (dropId: string) => void
}

const DEFAULTS: DropFormValues = {
  titleKa: '',
  titleEn: '',
  rarity: 'common',
  offer: 'percent_off',
  discountPercent: 20,
  faceValueGel: 5,
  date: new Date().toISOString().slice(0, 10),
  startTime: '14:00',
  endTime: '17:00',
  inventoryCap: 20,
  earlyAccessLevel: 0,
  earlyAccessMinutes: 0,
  isBossChest: false,
}

export default function DropCreator({
  venueId,
  venueTimezone,
  subscriptionTier,
  onCreated,
}: Props) {
  const [values, setValues] = useState<DropFormValues>(DEFAULTS)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function set<K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key as string]) return prev
      const next = { ...prev }
      delete next[key as string]
      return next
    })
  }

  // Worst case: every voucher redeemed at full face value.
  const projectedCost = useMemo(() => {
    const perUnit =
      values.offer === 'percent_off'
        ? values.faceValueGel * ((values.discountPercent ?? 0) / 100)
        : values.faceValueGel
    return perUnit * values.inventoryCap
  }, [values.offer, values.faceValueGel, values.discountPercent, values.inventoryCap])

  const needsConfirmation = projectedCost >= CONFIRM_THRESHOLD_GEL
  const durationMinutes = useMemo(() => {
    const [sh, sm] = values.startTime.split(':').map(Number)
    const [eh, em] = values.endTime.split(':').map(Number)
    return eh * 60 + em - (sh * 60 + sm)
  }, [values.startTime, values.endTime])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setServerError(null)

    const parsed = dropSchema.safeParse(values)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join('.')] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (needsConfirmation && !confirmed) {
      setServerError('Confirm the projected giveaway before scheduling.')
      return
    }

    setSubmitting(true)
    try {
      // The server action composes the local date + time into absolute
      // timestamps using the venue's timezone, then calls
      // materialise_drop_inventory() so the voucher rows exist before the
      // drop is visible on any map.
      const result = await createDrop({
        venueId,
        timezone: venueTimezone,
        ...parsed.data,
      })
      onCreated?.(result.dropId)
      setValues(DEFAULTS)
      setConfirmed(false)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Could not create drop')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule a drop</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Times are in {venueTimezone}. Vouchers are reserved the moment the drop
          goes live.
        </p>
      </header>

      {/* ---- Offer ---------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>Offer</SectionTitle>

        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(RARITY_META) as Array<keyof typeof RARITY_META>).map((key) => {
            const meta = RARITY_META[key]
            const active = values.rarity === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => set('rarity', key)}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-transparent ring-2 ring-offset-2'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
                style={active ? { boxShadow: `inset 0 0 0 9999px ${meta.accent}14` } : undefined}
              >
                <span
                  className="block text-sm font-semibold"
                  style={{ color: meta.accent }}
                >
                  {meta.label}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">{meta.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Title (English)" error={errors.titleEn}>
            <input
              className={inputClass}
              value={values.titleEn}
              onChange={(e) => set('titleEn', e.target.value)}
              placeholder="Half-price filter coffee"
            />
          </Field>
          <Field label="სათაური (ქართული)" error={errors.titleKa}>
            <input
              className={inputClass}
              value={values.titleKa}
              onChange={(e) => set('titleKa', e.target.value)}
              placeholder="ფილტრის ყავა ნახევარ ფასად"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Offer type">
            <select
              className={inputClass}
              value={values.offer}
              onChange={(e) => set('offer', e.target.value as DropFormValues['offer'])}
            >
              <option value="percent_off">Percentage off</option>
              <option value="bogo">Buy one get one</option>
              <option value="free_item">Free item</option>
            </select>
          </Field>

          {values.offer === 'percent_off' && (
            <Field label="Discount %" error={errors.discountPercent}>
              <input
                type="number"
                min={1}
                max={100}
                className={inputClass}
                value={values.discountPercent ?? ''}
                onChange={(e) => set('discountPercent', Number(e.target.value))}
              />
            </Field>
          )}

          <Field label="Item value (GEL)" hint="Used for ROI reporting">
            <input
              type="number"
              min={0}
              step={0.5}
              className={inputClass}
              value={values.faceValueGel}
              onChange={(e) => set('faceValueGel', Number(e.target.value))}
            />
          </Field>
        </div>
      </section>

      {/* ---- Schedule -------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>When</SectionTitle>

        <div className="flex flex-wrap gap-2">
          {OFF_PEAK_PRESETS.map((preset) => {
            const active =
              values.startTime === preset.start && values.endTime === preset.end
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  set('startTime', preset.start)
                  set('endTime', preset.end)
                }}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                }`}
              >
                {preset.label}
                <span className="ml-2 tabular-nums opacity-60">
                  {preset.start}–{preset.end}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Date" error={errors.date}>
            <input
              type="date"
              className={inputClass}
              value={values.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set('date', e.target.value)}
            />
          </Field>
          <Field label="Start" error={errors.startTime}>
            <input
              type="time"
              className={inputClass}
              value={values.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          </Field>
          <Field
            label="End"
            error={errors.endTime}
            hint={durationMinutes > 0 ? `${durationMinutes} min window` : undefined}
          >
            <input
              type="time"
              className={inputClass}
              value={values.endTime}
              onChange={(e) => set('endTime', e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* ---- Inventory ------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>How many</SectionTitle>

        <Field
          label="Inventory cap"
          error={errors.inventoryCap}
          hint="A hard limit. Once these are gone the drop disappears from the map."
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={100}
              value={values.inventoryCap}
              onChange={(e) => set('inventoryCap', Number(e.target.value))}
              className="flex-1 accent-neutral-900"
            />
            <input
              type="number"
              min={1}
              max={500}
              value={values.inventoryCap}
              onChange={(e) => set('inventoryCap', Number(e.target.value))}
              className={`${inputClass} w-24 text-center tabular-nums`}
            />
          </div>
        </Field>

        <div
          className={`rounded-xl border p-4 ${
            needsConfirmation
              ? 'border-amber-300 bg-amber-50'
              : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-neutral-600">
              Maximum you could give away
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {projectedCost.toFixed(2)} GEL
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {values.inventoryCap} vouchers, assuming every one is redeemed.
          </p>

          {needsConfirmation && (
            <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand this drop could cost up to{' '}
                {projectedCost.toFixed(2)} GEL.
              </span>
            </label>
          )}
        </div>
      </section>

      {/* ---- Gamification ---------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>Player perks</SectionTitle>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Early access from level"
            hint="0 disables early access"
          >
            <input
              type="number"
              min={0}
              max={15}
              className={inputClass}
              value={values.earlyAccessLevel}
              onChange={(e) => set('earlyAccessLevel', Number(e.target.value))}
            />
          </Field>
          <Field label="Minutes early">
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              className={inputClass}
              value={values.earlyAccessMinutes}
              disabled={values.earlyAccessLevel === 0}
              onChange={(e) => set('earlyAccessMinutes', Number(e.target.value))}
            />
          </Field>
        </div>

        <label
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            subscriptionTier === 'premium'
              ? 'border-neutral-200'
              : 'border-neutral-200 bg-neutral-50 opacity-60'
          }`}
        >
          <input
            type="checkbox"
            checked={values.isBossChest}
            disabled={subscriptionTier !== 'premium'}
            onChange={(e) => set('isBossChest', e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">
              Highlight as a Boss Chest
            </span>
            <span className="mt-0.5 block text-xs text-neutral-500">
              {subscriptionTier === 'premium'
                ? 'Oversized marker with a glow effect on the player map.'
                : 'Available on the Premium plan.'}
            </span>
          </span>
        </label>
      </section>

      {serverError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-6">
        <button
          type="submit"
          disabled={submitting || (needsConfirmation && !confirmed)}
          className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Scheduling…' : 'Schedule drop'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
const inputClass =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
      {children}
    </h2>
  )
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-neutral-800">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-neutral-500">{hint}</span>
      ) : null}
    </label>
  )
}
