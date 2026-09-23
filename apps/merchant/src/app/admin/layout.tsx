import Link from 'next/link'

import { isPlatformAdmin } from '@/lib/admin'
import { createServerSupabase } from '@/lib/supabase-server'
import SignOutButton from '@/components/SignOutButton'

/**
 * The operator surface is deliberately English-only: the audience is
 * GridlyTeam, not merchants, and keeping it monolingual means the Georgian
 * catalogue stays focused on copy real customers read.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!(await isPlatformAdmin())) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
          <h1 className="text-lg font-semibold text-ink">Operators only</h1>
          <p className="mt-2 text-sm text-muted">
            {user?.email
              ? `${user.email} is not a platform administrator.`
              : 'This account is not a platform administrator.'}
          </p>
          <p className="mt-4 text-xs text-faint">
            Signed in as the wrong account? Sign out and use the operator
            address.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <SignOutButton />
            <Link href="/" className="text-xs text-muted hover:text-ink">
              Back to the site
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Its own chrome: the merchant's venue nav has no business here, and
          an operator needs to see which account they are acting as. */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="rounded-md bg-ink px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-canvas">
            Operator
          </span>

          <nav className="flex flex-wrap gap-1 text-sm">
            <AdminLink href="/admin/applications">Applications</AdminLink>
            <AdminLink href="/admin/venues">Venues</AdminLink>
            <AdminLink href="/admin/analytics">Analytics</AdminLink>
            <AdminLink href="/admin/reports">Reports</AdminLink>
            <AdminLink href="/admin/players">Players</AdminLink>
            <AdminLink href="/admin/zones">Safety zones</AdminLink>
            <AdminLink href="/admin/config">Config</AdminLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-faint">{user?.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-muted transition hover:bg-canvas hover:text-ink"
    >
      {children}
    </Link>
  )
}
