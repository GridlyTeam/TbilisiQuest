import { createServerSupabase } from '@/lib/supabase-server'
import { resolveVenue, canManageDrops } from '@/lib/venues'
import { loadVenueAllowance } from '@/lib/admin-actions'
import DropsView, { type DropSummary } from '@/components/DropsView'
import RoleNotice from '@/components/RoleNotice'

export const dynamic = 'force-dynamic'

export default async function DropsPage() {
  const venue = await resolveVenue()
  if (!venue) return null

  if (!canManageDrops(venue.role)) {
    return <RoleNotice messageKey="drops.noAccess" />
  }

  const supabase = await createServerSupabase()

  const { data: drops } = await supabase
    .from('drops')
    .select(
      'id, title_ka, title_en, rarity, starts_at, ends_at, inventory_cap, is_boss_chest, safety_reviewed_at',
    )
    .eq('venue_id', venue.venueId)
    .order('starts_at', { ascending: false })
    .limit(25)

  // Remaining inventory is counted from available voucher rows rather than a
  // stored counter -- see the concurrency notes in docs/ARCHITECTURE.md.
  const { data: available } = await supabase
    .from('vouchers')
    .select('drop_id')
    .eq('status', 'available')

  const remainingByDrop = new Map<string, number>()
  for (const row of available ?? []) {
    const id = row.drop_id as string
    remainingByDrop.set(id, (remainingByDrop.get(id) ?? 0) + 1)
  }

  // What the operator has allowed this venue this month. Shown in the creator
  // so a merchant sees the ceiling before they hit it; the database enforces it
  // either way.
  const allowance = await loadVenueAllowance(venue.venueId)

  const summaries: DropSummary[] = (drops ?? []).map((d) => ({
    ...(d as Omit<DropSummary, 'remaining'>),
    remaining: remainingByDrop.get(d.id as string) ?? 0,
  }))

  return (
    <DropsView
      drops={summaries}
      venueId={venue.venueId}
      venueTimezone={process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? 'Asia/Tbilisi'}
      subscriptionTier={venue.subscriptionTier}
      allowance={allowance}
    />
  )
}
