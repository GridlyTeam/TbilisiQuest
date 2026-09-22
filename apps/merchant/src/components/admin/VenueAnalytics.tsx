'use client'

import { useState, useTransition } from 'react'

import {
  loadVenueAnalytics,
  loadVenueDrops,
  type VenueAnalyticsRow,
  type VenueDropRow,
} from '@/lib/admin-actions'

const RANGES = [7, 30, 90] as const

/**
 * Platform-wide venue performance.
 *
 * Ordered by redemptions rather than alphabetically: the question an operator
 * opens this with is "who is working and who is not", and a venue sitting at
 * zero after a month of drops is the row worth acting on.
 */
export default function VenueAnalytics({
  initial,
  initialDays,
}: {
  initial: VenueAnalyticsRow[]
  initialDays: number
}) {
  const [rows, setRows] = useState(initial)
  const [days, setDays] = useState<number>(initialDays)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function changeRange(next: number) {
    setDays(next)
    startTransition(async () => {
      setRows(await loadVenueAnalytics(next))
    })
  }

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? rows.filter(
        (r) =>
          r.name_en.toLowerCase().includes(needle) ||
          r.name_ka.toLowerCase().includes(needle) ||
          r.category.toLowerCase().includes(needle),
      )
    : rows

  const totals = visible.reduce(
    (acc, r) => ({
      reveals: acc.reveals + r.reveals,
      claimed: acc.claimed + r.claimed,
      redeemed: acc.redeemed + r.redeemed,
      visitors: acc.visitors + r.unique_visitors,
      value: acc.value + num(r.discount_value_gel),
    }),
    { reveals: 0, claimed: 0, redeemed: 0, visitors: 0, value: 0 },
  )
  const silent = visible.filter((r) => r.redeemed === 0 && r.drops_total > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Venue analytics</h1>
          <p className="mt-0.5 text-sm text-muted">
            {visible.length} venues · last {days} days
            {silent.length > 0 && ` · ${silent.length} with drops but no redemptions`}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => changeRange(r)}
              disabled={pending}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                days === r
                  ? 'bg-ink text-canvas'
                  : 'text-muted hover:text-ink disabled:opacity-40'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Got close" value={totals.reveals.toLocaleString()} hint="Reveals" />
        <Stat label="Claimed" value={totals.claimed.toLocaleString()} hint="Vouchers taken" />
        <Stat label="Walked in" value={totals.redeemed.toLocaleString()} hint="Redeemed at counter" />
        <Stat label="Unique visitors" value={totals.visitors.toLocaleString()} hint="Distinct players" />
        <Stat label="Discount given" value={`${totals.value.toFixed(0)} ₾`} hint="Face value" />
      </section>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by venue or category…"
        className="w-full max-w-md rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-indigo"
      />

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Venue</th>
              <th className="px-4 py-3 text-right font-medium">Drops</th>
              <th className="px-4 py-3 text-right font-medium">Seen</th>
              <th className="px-4 py-3 text-right font-medium">Close</th>
              <th className="px-4 py-3 text-right font-medium">Claimed</th>
              <th className="px-4 py-3 text-right font-medium">Redeemed</th>
              <th className="px-4 py-3 text-right font-medium">Conv.</th>
              <th className="px-4 py-3 text-right font-medium">Abandon</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((row) => (
              <VenueRows
                key={row.venue_id}
                row={row}
                expanded={expanded === row.venue_id}
                onToggle={() =>
                  setExpanded(expanded === row.venue_id ? null : row.venue_id)
                }
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-sm text-muted">
                  {pending ? 'Loading…' : 'No venues match.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Close = a player came within reveal range of a drop, the first point at
        which someone physically moved toward the venue. Conv. is redeemed ÷
        close: the share of that foot traffic that actually walked in. Abandon
        is claimed but never collected — inventory a merchant could not sell to
        anyone else.
      </p>
    </div>
  )
}

function VenueRows({
  row,
  expanded,
  onToggle,
}: {
  row: VenueAnalyticsRow
  expanded: boolean
  onToggle: () => void
}) {
  const [drops, setDrops] = useState<VenueDropRow[] | null>(null)

  async function toggle() {
    onToggle()
    if (!expanded && drops === null) {
      setDrops(await loadVenueDrops(row.venue_id))
    }
  }

  return (
    <>
      <tr className="cursor-pointer hover:bg-canvas" onClick={toggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{row.name_en}</span>
            {row.venue_state !== 'approved' && (
              <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-semibold uppercase text-warn-ink">
                {row.venue_state}
              </span>
            )}
            {row.tier === 'premium' && (
              <span className="rounded-full bg-indigo px-2 py-0.5 text-[10px] font-semibold uppercase text-canvas">
                Premium
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-faint">
            {row.category}
            {row.last_redeemed_at
              ? ` · last redeem ${formatDate(row.last_redeemed_at)}`
              : ' · no redemptions yet'}
          </p>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted">
          {row.drops_total}
          {row.drops_live > 0 && (
            <span className="text-live-ink"> ({row.drops_live} live)</span>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted">{row.map_views}</td>
        <td className="px-4 py-3 text-right tabular-nums text-muted">{row.reveals}</td>
        <td className="px-4 py-3 text-right tabular-nums">{row.claimed}</td>
        <td className="px-4 py-3 text-right font-medium tabular-nums">{row.redeemed}</td>
        <td className="px-4 py-3 text-right tabular-nums">{pct(row.conversion_pct)}</td>
        <td className="px-4 py-3 text-right tabular-nums text-muted">
          {pct(row.abandonment_pct)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {num(row.discount_value_gel).toFixed(0)} ₾
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={9} className="bg-canvas px-4 py-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
              Recent drops
            </h3>
            {drops === null ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : drops.length === 0 ? (
              <p className="text-xs text-muted">This venue has never run a drop.</p>
            ) : (
              <ul className="space-y-1">
                {drops.map((d) => (
                  <li key={d.drop_id} className="flex flex-wrap gap-x-3 text-xs">
                    <span className="w-32 shrink-0 tabular-nums text-faint">
                      {formatDate(d.starts_at)}
                    </span>
                    <span className="w-20 shrink-0 capitalize text-muted">{d.rarity}</span>
                    <span className="min-w-40 flex-1 text-ink">
                      {d.title_en ?? d.title_ka}
                    </span>
                    <span className="tabular-nums text-muted">
                      {d.reveals} close · {d.claimed} claimed ·{' '}
                      <span className="font-semibold text-ink">{d.redeemed}</span> of{' '}
                      {d.inventory_cap} redeemed · {pct(d.foot_traffic_conversion_pct)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
    </div>
  )
}

/** PostgREST returns numeric as a string, so every figure goes through this. */
function num(value: number | string | null): number {
  return value == null ? 0 : Number(value)
}

function pct(value: number | string | null): string {
  return value == null ? '—' : `${num(value)}%`
}

/**
 * Pinned to Tbilisi time rather than the viewer's. The server renders this
 * component too, and a host on UTC would otherwise disagree with the browser
 * and trip a hydration mismatch -- and an operator in any timezone wants the
 * hour the shop actually saw.
 */
function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Tbilisi',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
