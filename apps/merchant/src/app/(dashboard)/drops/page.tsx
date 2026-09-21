import { createServerSupabase } from '@/lib/supabase-server'
import { resolveVenue, canManageDrops } from '@/lib/venues'
import DropCreator from '@/components/DropCreator'

export const dynamic = 'force-dynamic'

type DropRow = {
  id: string
  title_en: string
  rarity: 'common' | 'rare' | 'legendary'
  status: string
  starts_at: string
  ends_at: string
  inventory_cap: number
  is_boss_chest: boolean
}

export default async function DropsPage() {
  const venue = await resolveVenue()
  if (!venue) return null

  if (!canManageDrops(venue.role)) {
    return (
      <p className="text-sm text-neutral-600">
        Your role doesn&apos;t include drop management. Head to the Counter tab.
      </p>
    )
  }

  const supabase = await createServerSupabase()

  const { data: drops } = await supabase
    .from('drops')
    .select(
      'id, title_en, rarity, status, starts_at, ends_at, inventory_cap, is_boss_chest',
    )
    .eq('venue_id', venue.venueId)
    .order('starts_at', { ascending: false })
    .limit(25)

  // Remaining inventory comes from counting available voucher rows rather than
  // a stored counter -- see the concurrency notes in docs/ARCHITECTURE.md.
  const { data: available } = await supabase
    .from('vouchers')
    .select('drop_id')
    .eq('status', 'available')

  const remainingByDrop = new Map<string, number>()
  for (const row of available ?? []) {
    const id = row.drop_id as string
    remainingByDrop.set(id, (remainingByDrop.get(id) ?? 0) + 1)
  }

  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
          Scheduled drops
        </h2>

        {!drops || drops.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            No drops yet. Create your first one below.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {(drops as DropRow[]).map((drop) => (
              <DropRowItem
                key={drop.id}
                drop={drop}
                remaining={remainingByDrop.get(drop.id) ?? 0}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <DropCreator
          venueId={venue.venueId}
          venueTimezone={process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? 'Asia/Tbilisi'}
          subscriptionTier={venue.subscriptionTier}
        />
      </section>
    </div>
  )
}

const RARITY_COLOR = {
  common: '#7c8b9a',
  rare: '#4a8fd4',
  legendary: '#e8a33d',
} as const

function DropRowItem({ drop, remaining }: { drop: DropRow; remaining: number }) {
  const starts = new Date(drop.starts_at)
  const ends = new Date(drop.ends_at)
  const now = new Date()

  const isLive = now >= starts && now <= ends
  const isPast = now > ends
  const claimed = drop.inventory_cap - remaining

  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <span
        className="h-9 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: RARITY_COLOR[drop.rarity] }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{drop.title_en}</span>
          {drop.is_boss_chest && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Boss
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {starts.toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
          {' – '}
          {ends.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {claimed} / {drop.inventory_cap}
        </p>
        <p className="text-xs text-neutral-500">claimed</p>
      </div>

      <span
        className={`w-16 shrink-0 rounded-full px-2 py-1 text-center text-[11px] font-medium ${
          isLive
            ? 'bg-emerald-100 text-emerald-800'
            : isPast
              ? 'bg-neutral-100 text-neutral-500'
              : 'bg-blue-100 text-blue-800'
        }`}
      >
        {isLive ? 'Live' : isPast ? 'Ended' : 'Queued'}
      </span>
    </li>
  )
}
