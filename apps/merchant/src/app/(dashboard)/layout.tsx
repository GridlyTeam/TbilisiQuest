import { getMemberships, canManageDrops } from '@/lib/venues'
import { isPlatformAdmin } from '@/lib/admin'
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

  const [memberships, admin] = await Promise.all([
    getMemberships(),
    isPlatformAdmin(),
  ])

  // A signed-in account with no venue link can't do anything useful, so show
  // the fix rather than an empty dashboard.
  // An operator with no venue of their own still needs the admin area.
  if (memberships.length === 0 && !admin) {
    return <NoVenueNotice userId={user?.id ?? null} />
  }

  const primary = memberships[0]

  return (
    <div className="min-h-screen bg-canvas">
      <DashboardNav
        venueNameKa={primary?.nameKa ?? ''}
        venueNameEn={primary?.nameEn ?? 'Operator'}
        role={primary?.role ?? 'admin'}
        showManagement={primary ? canManageDrops(primary.role) : false}
        isAdmin={admin}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
