import { createServerSupabase } from '@/lib/supabase-server'
import Landing, { type PublicStats } from '@/components/Landing'

// The counts change as drops go live, so the page is rendered per request
// rather than frozen at build time.
export const dynamic = 'force-dynamic'

/**
 * The public front door.
 *
 * Fetches the live counts here so the marketing copy can say "6 places, 40
 * vouchers right now" instead of "hundreds of offers". A real number that is
 * smaller than a boast is still more persuasive than the boast, and it cannot
 * age into a lie.
 */
export default async function HomePage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.rpc('public_stats')
  const row = Array.isArray(data) ? data[0] : data

  return <Landing stats={(row as PublicStats) ?? null} />
}
