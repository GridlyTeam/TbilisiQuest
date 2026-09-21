'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useI18n } from '@/lib/i18n'
import { markDropReviewed } from '@/lib/actions'
import DropCreator from './DropCreator'

export type DropSummary = {
  id: string
  title_ka: string
  title_en: string
  rarity: 'common' | 'rare' | 'legendary'
  starts_at: string
  ends_at: string
  inventory_cap: number
  is_boss_chest: boolean
  remaining: number
  safety_reviewed_at: string | null
}

const RARITY_COLOR = {
  common: '#5D6B8A',
  rare: '#6C6BE8',
  legendary: '#E0913A',
} as const

export default function DropsView({
  drops,
  venueId,
  venueTimezone,
  subscriptionTier,
}: {
  drops: DropSummary[]
  venueId: string
  venueTimezone: string
  subscriptionTier: 'basic' | 'premium'
}) {
  const { t } = useI18n()
  const router = useRouter()

  // Anything derived from the current clock has to wait for the client.
  // Rendering `new Date()` during SSR bakes the server's instant and timezone
  // into the HTML, and the browser then renders a different one -- which is
  // exactly the hydration mismatch React complains about. Locally the two
  // happen to be close; on a UTC server they would differ by four hours.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-faint">
          {t('drops.scheduled')}
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-muted">{t('drops.reviewHint')}</p>

        {drops.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
            {t('drops.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {drops.map((drop) => (
              <DropRow key={drop.id} drop={drop} now={now} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <DropCreator
          venueId={venueId}
          venueTimezone={venueTimezone}
          subscriptionTier={subscriptionTier}
          onCreated={() => router.refresh()}
        />
      </section>
    </div>
  )
}

function DropRow({ drop, now }: { drop: DropSummary; now: Date | null }) {
  const { t, locale } = useI18n()
  const [reviewing, setReviewing] = useState(false)
  const reviewed = drop.safety_reviewed_at != null

  const starts = new Date(drop.starts_at)
  const ends = new Date(drop.ends_at)

  const isLive = now != null && now >= starts && now <= ends
  const isPast = now != null && now > ends
  const claimed = drop.inventory_cap - drop.remaining
  const title = locale === 'ka' ? drop.title_ka : drop.title_en
  const intlLocale = locale === 'ka' ? 'ka-GE' : 'en-GB'

  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <span
        className="h-9 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: RARITY_COLOR[drop.rarity] }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{title}</span>
          {drop.is_boss_chest && (
            <span className="rounded bg-warn px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn-ink">
              {t('drops.boss')}
            </span>
          )}
        </div>
        <p className="mt-0.5 min-h-[1rem] text-xs text-muted">
          {now == null
            ? null
            : `${starts.toLocaleString(intlLocale, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })} – ${ends.toLocaleTimeString(intlLocale, {
                hour: '2-digit',
                minute: '2-digit',
              })}`}
        </p>
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-ink">
          {claimed} / {drop.inventory_cap}
        </p>
        <p className="text-xs text-muted">{t('drops.claimed')}</p>
      </div>

      {reviewed ? null : (
        <button
          onClick={async () => {
            setReviewing(true)
            try {
              await markDropReviewed(drop.id)
            } finally {
              setReviewing(false)
            }
          }}
          disabled={reviewing}
          className="shrink-0 rounded-lg bg-warn-ink px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {t('drops.reviewAction')}
        </button>
      )}

      <span
        className={`w-20 shrink-0 rounded-full px-2 py-1 text-center text-[11px] font-medium ${
          !reviewed
            ? 'bg-warn text-warn-ink'
            : 
          isLive
            ? 'bg-live text-live-ink'
            : isPast
              ? 'bg-canvas text-muted'
              : 'bg-indigo-soft text-indigo'
        }`}
      >
        {now == null
          ? ' '
          : isLive
            ? t('drops.live')
            : isPast
              ? t('drops.ended')
              : t('drops.queued')}
      </span>
    </li>
  )
}
