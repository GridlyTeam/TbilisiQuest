import { redirect } from 'next/navigation'

import { createServerSupabase } from '@/lib/supabase-server'
import { getMemberships } from '@/lib/venues'
import { loadMyApplication } from '@/lib/apply-actions'
import ApplyForm from '@/components/ApplyForm'

export const dynamic = 'force-dynamic'

/**
 * Where a newly registered merchant lands: tell us about the business.
 *
 * Anyone who already runs a venue is sent to their dashboard instead -- the
 * form would only fail at the database, which enforces the same rule.
 */
export default async function ApplyPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const memberships = await getMemberships()
  if (memberships.length > 0) redirect('/drops')

  const application = await loadMyApplication()

  return <ApplyForm existing={application} email={user.email ?? ''} />
}
