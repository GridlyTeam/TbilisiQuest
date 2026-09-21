import { createServerSupabase } from '@/lib/supabase-server'
import ZoneEditor, { type ZoneShape } from '@/components/admin/ZoneEditor'

export const dynamic = 'force-dynamic'

export default async function AdminZonesPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('safety_zone_shapes')
    .select('id, kind, name, buffer_m, is_active, geojson')
    .order('kind')

  return <ZoneEditor zones={(data ?? []) as ZoneShape[]} />
}
