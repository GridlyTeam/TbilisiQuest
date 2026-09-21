'use client'

import { useRouter } from 'next/navigation'

import { useI18n } from '@/lib/i18n'
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
}

const RARITY_COLOR = {
  common: '#7C8B9A',
  rare: '#4A8FD4',
  legendary: '#E8A33D',
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

  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
          {t('drops.scheduled')}
        </h2>

        {drops.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            {t('drops.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {drops.map((drop) => (
              <DropRow key={drop.id} drop={drop} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
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

function DropRow({ drop }: { drop: DropSummary }) {
  const { t, locale } = useI18n()

  const starts = new Date(drop.starts_at)
  const ends = new Date(drop.ends_at)
  const now = new Date()

  const isLive = now >= starts && now <= ends
  const isPast = now > ends
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
          <span className="truncate text-sm font-medium text-neutral-900">{title}</span>
          {drop.is_boss_chest && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              {t('drops.boss')}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {starts.toLocaleString(intlLocale, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {' – '}
          {ends.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-neutral-900">
          {claimed} / {drop.inventory_cap}
        </p>
        <p className="text-xs text-neutral-500">{t('drops.claimed')}</p>
      </div>

      <span
        className={`w-20 shrink-0 rounded-full px-2 py-1 text-center text-[11px] font-medium ${
          isLive
            ? 'bg-emerald-100 text-emerald-800'
            : isPast
              ? 'bg-neutral-100 text-neutral-500'
              : 'bg-blue-100 text-blue-800'
        }`}
      >
        {isLive ? t('drops.live') : isPast ? t('drops.ended') : t('drops.queued')}
      </span>
    </li>
  )
}
