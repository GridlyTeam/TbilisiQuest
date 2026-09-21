'use client'

import { useI18n } from '@/lib/i18n'

export type PerformanceRow = {
  drop_id: string
  title_ka: string | null
  title_en: string | null
  map_views: number | null
  reveals: number | null
  claimed: number | null
  redeemed: number | null
  foot_traffic_conversion_pct: number | null
  discount_value_gel: number | null
}

export default function AnalyticsView({ rows }: { rows: PerformanceRow[] }) {
  const { t, locale } = useI18n()

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
          label={t('analytics.gotClose')}
          value={totals.reveals.toLocaleString()}
          hint={t('analytics.gotCloseHint')}
        />
        <Stat
          label={t('analytics.walkedIn')}
          value={totals.redeemed.toLocaleString()}
          hint={t('analytics.walkedInHint')}
        />
        <Stat
          label={t('analytics.discountGiven')}
          value={`${totals.value.toFixed(0)} ₾`}
          hint={t('analytics.discountHint')}
        />
      </section>

      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-faint">
          {t('analytics.performance')}
        </h2>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
            {t('analytics.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">{t('analytics.colDrop')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('analytics.colSeen')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('analytics.colRevealed')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('analytics.colClaimed')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('analytics.colRedeemed')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('analytics.colConversion')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.drop_id}>
                    <td className="px-4 py-3 text-ink">
                      {(locale === 'ka' ? r.title_ka : r.title_en) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {r.map_views ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {r.reveals ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.claimed ?? 0}</td>
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

        <p className="mt-3 text-xs leading-relaxed text-muted">
          {t('analytics.explainer')}
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
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs text-faint">{hint}</p>
    </div>
  )
}
