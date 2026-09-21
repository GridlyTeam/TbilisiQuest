import { getMemberships, canManageDrops } from '@/lib/venues'
import { createServerSupabase } from '@/lib/supabase-server'
import DashboardNav from '@/components/DashboardNav'
import NoVenueNotice from '@/components/NoVenueNotice'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const memberships = await getMemberships()

  // A signed-in account with no venue link can't do anything useful, so show
  // the fix rather than an empty dashboard.
  if (memberships.length === 0) {
    return <NoVenueNotice userId={user?.id ?? null} />
  }

  const primary = memberships[0]

  return (
    <div className="min-h-screen bg-neutral-50">
      <DashboardNav
        venueNameKa={primary.nameKa}
        venueNameEn={primary.nameEn}
        role={primary.role}
        showManagement={canManageDrops(primary.role)}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
