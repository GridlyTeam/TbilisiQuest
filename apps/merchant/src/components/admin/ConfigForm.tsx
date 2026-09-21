'use client'

import { useState } from 'react'

import { updateSafetyConfig } from '@/lib/admin-actions'

export type SafetyConfigRow = {
  play_opens_at: string
  play_closes_at: string
  max_speed_kmh: number
  require_manual_review: boolean
}

/**
 * Global safety limits.
 *
 * These are data rather than constants precisely so they can be tightened
 * without a deploy — which is what you want on the day something goes wrong,
 * not a week later behind an app-store review.
 */
export default function ConfigForm({ config }: { config: SafetyConfigRow }) {
  const [values, setValues] = useState({
    playOpensAt: config.play_opens_at.slice(0, 5),
    playClosesAt: config.play_closes_at.slice(0, 5),
    maxSpeedKmh: Number(config.max_speed_kmh),
    requireManualReview: config.require_manual_review,
  })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const widened =
    values.playOpensAt <= '06:00' || values.playClosesAt >= '22:00'

  return (
    <form
      className="max-w-xl space-y-6"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        setSaved(false)
        try {
          await updateSafetyConfig(values)
          setSaved(true)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <div>
        <h1 className="text-xl font-semibold text-ink">Safety configuration</h1>
        <p className="mt-0.5 text-sm text-muted">
          Applies to every player immediately. No deploy needed.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Play opens" hint="Tbilisi local time">
            <input
              type="time"
              value={values.playOpensAt}
              onChange={(e) => setValues({ ...values, playOpensAt: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Play closes">
            <input
              type="time"
              value={values.playClosesAt}
              onChange={(e) => setValues({ ...values, playClosesAt: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        {widened && (
          <p className="rounded-lg bg-warn px-3 py-2 text-xs text-warn-ink">
            That window includes hours of darkness. The first-year rule is
            11:00–19:00; widen it for testing, not for players.
          </p>
        )}

        <Field
          label="Speed lock (km/h)"
          hint="The app locks above this. 10 clears a brisk walk and blocks cycling."
        >
          <input
            type="number"
            min={3}
            max={30}
            step={0.5}
            value={values.maxSpeedKmh}
            onChange={(e) =>
              setValues({ ...values, maxSpeedKmh: Number(e.target.value) })
            }
            className={`${inputClass} w-32`}
          />
        </Field>

        <label className="flex items-start gap-3 rounded-lg border border-line p-3">
          <input
            type="checkbox"
            checked={values.requireManualReview}
            onChange={(e) =>
              setValues({ ...values, requireManualReview: e.target.checked })
            }
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              Require manual review before a drop goes live
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Turning this off means drops appear without anyone checking their
              surroundings. Only reasonable while the exclusion zones are
              incomplete and you are testing.
            </span>
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-danger-ink">{error}</p>}
      {saved && <p className="text-sm text-live-ink">Saved.</p>}

      <button
        disabled={busy}
        className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-canvas disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save configuration'}
      </button>
    </form>
  )
}

const inputClass =
  'rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-indigo'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}
