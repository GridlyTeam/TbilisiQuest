import { loadVenueAnalytics } from '@/lib/admin-actions'
import VenueAnalytics from '@/components/admin/VenueAnalytics'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 30

export default async function AdminAnalyticsPage() {
  const rows = await loadVenueAnalytics(DEFAULT_DAYS)
  return <VenueAnalytics initial={rows} initialDays={DEFAULT_DAYS} />
}
