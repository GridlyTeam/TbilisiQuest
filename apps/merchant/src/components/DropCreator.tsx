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

import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { createDrop } from '../lib/actions'
import { useI18n, type MessageKey } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
// Mirrors the CHECK constraints in the database. The DB is the real authority;
// this exists so the merchant gets feedback before a round trip.
const dropSchema = z
  .object({
    titleKa: z.string().min(2, 'creator.errTitleKa'),
    titleEn: z.string().min(2, 'creator.errTitleEn'),
    descriptionKa: z.string().max(280).optional(),
    descriptionEn: z.string().max(280).optional(),
    rarity: z.enum(['common', 'rare', 'legendary']),
    offer: z.enum(['percent_off', 'bogo', 'free_item']),
    discountPercent: z.number().int().min(1).max(100).optional(),
    faceValueGel: z.number().min(0).max(10000),
    date: z.string().min(1, 'creator.errDate'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    inventoryCap: z.number().int().min(1).max(500),
    earlyAccessLevel: z.number().int().min(0).max(15),
    earlyAccessMinutes: z.number().int().min(0).max(120),
    isBossChest: z.boolean(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'creator.errEndAfterStart',
    path: ['endTime'],
  })
  .refine((v) => v.offer !== 'percent_off' || v.discountPercent != null, {
    message: 'creator.errDiscount',
    path: ['discountPercent'],
  })

export type DropFormValues = z.infer<typeof dropSchema>

// ---------------------------------------------------------------------------
// Off-peak presets
// ---------------------------------------------------------------------------
const OFF_PEAK_PRESETS = [
  { key: 'afternoon', labelKey: 'creator.presetAfternoon', start: '14:00', end: '17:00' },
  { key: 'morning', labelKey: 'creator.presetMorning', start: '10:00', end: '12:00' },
  { key: 'lateEvening', labelKey: 'creator.presetEvening', start: '21:00', end: '23:00' },
] as const satisfies ReadonlyArray<{
  key: string
  labelKey: MessageKey
  start: string
  end: string
}>

const RARITY_META = {
  common: { labelKey: 'rarity.common', hintKey: 'rarity.commonHint', accent: '#7c8b9a' },
  rare: { labelKey: 'rarity.rare', hintKey: 'rarity.rareHint', accent: '#4a8fd4' },
  legendary: { labelKey: 'rarity.legendary', hintKey: 'rarity.legendaryHint', accent: '#e8a33d' },
} as const satisfies Record<string, { labelKey: MessageKey; hintKey: MessageKey; accent: string }>

// Above this projected giveaway we make the merchant confirm explicitly.
const CONFIRM_THRESHOLD_GEL = 500

type Props = {
  venueId: string
  venueTimezone: string
  subscriptionTier: 'basic' | 'premium'
  onCreated?: (dropId: string) => void
}

// ---------------------------------------------------------------------------
// Local day helpers
// ---------------------------------------------------------------------------
// These work in the browser's timezone, which for a Tbilisi merchant on a
// Tbilisi machine is the venue's timezone. The authoritative conversion to an
// absolute instant still happens server-side in createDrop().

function todayISO(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

function windowHasPassed(dateISO: string, endTime: string): boolean {
  return new Date(`${dateISO}T${endTime}:00`) <= new Date()
}

// Scheduling an off-peak slot that already ended today is never what the
// merchant meant, so the form opens on the next occurrence of it instead.
//
// `date` starts empty and is filled in after mount: reading the clock during
// render would produce the server's date in the SSR markup and the browser's
// date on hydration, which mismatches whenever the two disagree -- guaranteed
// once this is served from a UTC host.
function makeDefaults(): DropFormValues {
  return {
    titleKa: '',
    titleEn: '',
    rarity: 'common',
    offer: 'percent_off',
    discountPercent: 20,
    faceValueGel: 5,
    date: '',
    startTime: '14:00',
    endTime: '17:00',
    inventoryCap: 20,
    earlyAccessLevel: 0,
    earlyAccessMinutes: 0,
    isBossChest: false,
  }
}

export default function DropCreator({
  venueId,
  venueTimezone,
  subscriptionTier,
  onCreated,
}: Props) {
  const { t } = useI18n()
  const [values, setValues] = useState<DropFormValues>(makeDefaults)
  const [today, setToday] = useState('')

  useEffect(() => {
    const iso = todayISO()
    setToday(iso)
    setValues((prev) =>
      prev.date
        ? prev
        : {
            ...prev,
            date: windowHasPassed(iso, prev.endTime) ? addDays(iso, 1) : iso,
          },
    )
  }, [])
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
  const inThePast = values.date !== '' && windowHasPassed(values.date, values.endTime)
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
      setServerError(t('creator.confirmFirst'))
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
      setValues(makeDefaults())
      setConfirmed(false)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t('creator.confirmFirst'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {t('creator.title')}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t('creator.timezoneNote', { tz: venueTimezone })}
        </p>
      </header>

      {/* ---- Offer ---------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>{t('creator.sectionOffer')}</SectionTitle>

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
                  {t(meta.labelKey)}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {t(meta.hintKey)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('creator.titleEn')} error={errors.titleEn && t(errors.titleEn as MessageKey)}>
            <input
              className={inputClass}
              value={values.titleEn}
              onChange={(e) => set('titleEn', e.target.value)}
              placeholder="Half-price filter coffee"
            />
          </Field>
          <Field label={t('creator.titleKa')} error={errors.titleKa && t(errors.titleKa as MessageKey)}>
            <input
              className={inputClass}
              value={values.titleKa}
              onChange={(e) => set('titleKa', e.target.value)}
              placeholder="ფილტრის ყავა ნახევარ ფასად"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label={t('creator.offerType')}>
            <select
              className={inputClass}
              value={values.offer}
              onChange={(e) => set('offer', e.target.value as DropFormValues['offer'])}
            >
              <option value="percent_off">{t('creator.percentOff')}</option>
              <option value="bogo">{t('creator.bogo')}</option>
              <option value="free_item">{t('creator.freeItem')}</option>
            </select>
          </Field>

          {values.offer === 'percent_off' && (
            <Field label={t('creator.discountPct')} error={errors.discountPercent && t(errors.discountPercent as MessageKey)}>
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

          <Field label={t('creator.itemValue')} hint={t('creator.itemValueHint')}>
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
        <SectionTitle>{t('creator.sectionWhen')}</SectionTitle>

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
                  // Picking "Afternoon lull" at 19:00 means tomorrow's lull.
                  if (windowHasPassed(values.date, preset.end)) {
                    set('date', addDays(todayISO(), 1))
                  }
                }}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                }`}
              >
                {t(preset.labelKey)}
                <span className="ml-2 tabular-nums opacity-60">
                  {preset.start}–{preset.end}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label={t('creator.date')} error={errors.date && t(errors.date as MessageKey)}>
            <input
              type="date"
              className={inputClass}
              value={values.date}
              min={today || undefined}
              onChange={(e) => set('date', e.target.value)}
            />
          </Field>
          <Field label={t('creator.start')} error={errors.startTime && t(errors.startTime as MessageKey)}>
            <input
              type="time"
              className={inputClass}
              value={values.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          </Field>
          <Field
            label={t('creator.end')}
            error={errors.endTime && t(errors.endTime as MessageKey)}
            hint={
              durationMinutes > 0
                ? t('creator.duration', { minutes: durationMinutes })
                : undefined
            }
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
        <SectionTitle>{t('creator.sectionHowMany')}</SectionTitle>

        <Field
          label={t('creator.cap')}
          error={errors.inventoryCap && t(errors.inventoryCap as MessageKey)}
          hint={t('creator.capHint')}
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
            <span className="text-sm text-neutral-600">{t('creator.maxGiveaway')}</span>
            <span className="text-lg font-semibold tabular-nums">
              {projectedCost.toFixed(2)} ₾
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {t('creator.giveawayNote', { count: values.inventoryCap })}
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
                {t('creator.confirmCost', { amount: projectedCost.toFixed(2) })}
              </span>
            </label>
          )}
        </div>
      </section>

      {/* ---- Gamification ---------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>{t('creator.sectionPerks')}</SectionTitle>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label={t('creator.earlyAccessLevel')}
            hint={t('creator.earlyAccessHint')}
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
          <Field label={t('creator.earlyMinutes')}>
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
            <span className="block text-sm font-medium">{t('creator.bossChest')}</span>
            <span className="mt-0.5 block text-xs text-neutral-500">
              {subscriptionTier === 'premium'
                ? t('creator.bossChestOn')
                : t('creator.bossChestOff')}
            </span>
          </span>
        </label>
      </section>

      {inThePast && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{t('creator.windowPassed')}</span>
          <button
            type="button"
            onClick={() => set('date', addDays(todayISO(), 1))}
            className="rounded-md bg-amber-900 px-3 py-1 text-xs font-semibold text-white"
          >
            {t('creator.useTomorrow')}
          </button>
        </div>
      )}

      {serverError && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-6">
        <button
          type="submit"
          disabled={submitting || inThePast || (needsConfirmation && !confirmed)}
          className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? t('creator.submitting') : t('creator.submit')}
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
