import Link from 'next/link'

import { getMemberships, canManageDrops } from '@/lib/venues'
import { createServerSupabase } from '@/lib/supabase-server'
import SignOutButton from '@/components/SignOutButton'

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

  // A signed-in account with no venue link can't do anything useful. Rather
  // than an empty dashboard, explain exactly how to fix it.
  if (memberships.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold">No venue linked yet</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Your account isn&apos;t connected to a venue. An owner needs to add
            you, or you can link yourself in the Supabase SQL editor:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-left text-[11px] leading-relaxed text-neutral-100">
{`insert into public.merchant_users
  (user_id, venue_id, role)
values
  ('${user?.id ?? '<your-user-id>'}',
   '11111111-1111-1111-1111-111111111101',
   'owner');`}
          </pre>
          <p className="mt-3 text-xs text-neutral-500">
            That venue id is Fabrika Coffee Room from the seed data.
          </p>
          <div className="mt-6">
            <SignOutButton />
          </div>
        </div>
      </main>
    )
  }

  const primary = memberships[0]
  const showDrops = canManageDrops(primary.role)

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-neutral-900">Tbilisi Quest</span>

          <nav className="flex items-center gap-1 text-sm">
            {showDrops && <NavLink href="/drops">Drops</NavLink>}
            <NavLink href="/counter">Counter</NavLink>
            {showDrops && <NavLink href="/analytics">Analytics</NavLink>}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-neutral-500 sm:inline">
              {primary.nameEn} · {primary.role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
    >
      {children}
    </Link>
  )
}
