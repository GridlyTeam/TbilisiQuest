import { createServerSupabase } from '@/lib/supabase-server'
import VenueManager, { type AdminVenue } from '@/components/admin/VenueManager'

export const dynamic = 'force-dynamic'

export default async function AdminVenuesPage() {
  const supabase = await createServerSupabase()

  // venue_coords gives plain lat/lng; venues carries the lifecycle fields.
  const [{ data: venues }, { data: coords }, { data: staff }] = await Promise.all([
    supabase
      .from('venues')
      .select('id, name_ka, name_en, category, status, subscription_tier, address_en, max_vouchers_per_drop, monthly_voucher_allowance')
      .order('name_en'),
    supabase.from('venue_coords').select('id, lat, lng'),
    supabase.from('merchant_users').select('venue_id, role, users(display_name)'),
  ])

  const coordById = new Map((coords ?? []).map((c) => [c.id as string, c]))
  const staffByVenue = new Map<string, AdminVenue['staff']>()
  for (const row of staff ?? []) {
    const list = staffByVenue.get(row.venue_id as string) ?? []
    const profile = row.users as unknown as { display_name: string | null } | null
    list.push({ role: row.role as string, display_name: profile?.display_name ?? null })
    staffByVenue.set(row.venue_id as string, list)
  }

  const rows: AdminVenue[] = (venues ?? []).map((v) => ({
    ...(v as Omit<AdminVenue, 'lat' | 'lng' | 'staff'>),
    lat: (coordById.get(v.id as string)?.lat as number) ?? 41.6998,
    lng: (coordById.get(v.id as string)?.lng as number) ?? 44.7935,
    staff: staffByVenue.get(v.id as string) ?? [],
  }))

  return <VenueManager venues={rows} />
}
