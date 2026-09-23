import { createServerSupabase } from '@/lib/supabase-server'
import ConfigForm, { type SafetyConfigRow } from '@/components/admin/ConfigForm'

export const dynamic = 'force-dynamic'

export default async function AdminConfigPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('safety_config')
    .select('play_opens_at, play_closes_at, max_speed_kmh, require_manual_review')
    .single()

  if (!data) return <p className="text-sm text-muted">No configuration row found.</p>

  return <ConfigForm config={data as SafetyConfigRow} />
}
