import { createServerSupabase } from '@/lib/supabase-server'
import { resolveVenue, canSeeRevenue } from '@/lib/venues'

export const dynamic = 'force-dynamic'

type Performance = {
  drop_id: string
  title_en: string
  rarity: string
  map_views: number
  reveals: number
  claimed: number
  redeemed: number
  sell_through_pct: number | null
  foot_traffic_conversion_pct: number | null
  claim_abandonment_pct: number | null
  discount_value_gel: number | null
}

export default async function AnalyticsPage() {
  const venue = await resolveVenue()
  if (!venue) return null

  if (!canSeeRevenue(venue.role)) {
    return (
      <p className="text-sm text-neutral-600">
        Your role doesn&apos;t include analytics access.
      </p>
    )
  }

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('drop_performance')
    .select('*')
    .eq('venue_id', venue.venueId)
    .order('starts_at', { ascending: false })
    .limit(20)

  const rows = (data ?? []) as Performance[]

  const totals = rows.reduce(
    (acc, r) => ({
      reveals: acc.reveals + (r.reveals ?? 0),
      redeemed: acc.redeemed + (r.redeemed ?? 0),
      value: acc.value + Number(r.discount_value_gel ?? 0),
    }),
    { reveals: 0, redeemed: 0, value: 0 },
  )

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="People who got close"
          value={totals.reveals.toLocaleString()}
          hint="Crossed the reveal radius"
        />
        <Stat
          label="Walked in and redeemed"
          value={totals.redeemed.toLocaleString()}
          hint="Actual foot traffic"
        />
        <Stat
          label="Discount given"
          value={`${totals.value.toFixed(0)} GEL`}
          hint="Face value handed over"
        />
      </section>

      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Drop performance
        </h2>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            Nothing to report yet. Numbers appear once players start finding your
            drops.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3 font-medium">Drop</th>
                  <th className="px-4 py-3 text-right font-medium">Seen</th>
                  <th className="px-4 py-3 text-right font-medium">Revealed</th>
                  <th className="px-4 py-3 text-right font-medium">Claimed</th>
                  <th className="px-4 py-3 text-right font-medium">Redeemed</th>
                  <th className="px-4 py-3 text-right font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.drop_id}>
                    <td className="px-4 py-3">{r.title_en}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                      {r.map_views ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                      {r.reveals ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.claimed ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {r.redeemed ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.foot_traffic_conversion_pct != null
                        ? `${r.foot_traffic_conversion_pct}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Conversion is redemptions divided by reveals: of everyone who got close
          enough to see the offer, the share who actually walked in. That step is
          the one worth optimising, because crossing the reveal radius is the
          first moment a person physically moved toward you.
        </p>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-neutral-400">{hint}</p>
    </div>
  )
}
