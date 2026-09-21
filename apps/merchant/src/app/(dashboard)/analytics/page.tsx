import { createServerSupabase } from '@/lib/supabase-server'
import { resolveVenue, canSeeRevenue } from '@/lib/venues'
import AnalyticsView, { type PerformanceRow } from '@/components/AnalyticsView'
import RoleNotice from '@/components/RoleNotice'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const venue = await resolveVenue()
  if (!venue) return null

  if (!canSeeRevenue(venue.role)) {
    return <RoleNotice messageKey="analytics.noAccess" />
  }

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('drop_performance')
    .select('*')
    .eq('venue_id', venue.venueId)
    .order('starts_at', { ascending: false })
    .limit(20)

  return <AnalyticsView rows={(data ?? []) as PerformanceRow[]} />
}
