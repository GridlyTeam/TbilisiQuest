import { resolveVenue } from '@/lib/venues'
import CounterQRStation from '@/components/CounterQRStation'

export default async function CounterPage() {
  const venue = await resolveVenue()
  if (!venue) return null

  return <CounterQRStation venueId={venue.venueId} venueName={venue.nameEn} />
}
