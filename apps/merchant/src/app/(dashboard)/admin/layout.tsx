import Link from 'next/link'

import { isPlatformAdmin } from '@/lib/admin'

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
  if (!(await isPlatformAdmin())) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">Operators only</h1>
        <p className="mt-2 text-sm text-muted">
          This account is not a platform administrator.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-ink p-3 text-left text-[11px] text-canvas">
{`insert into public.platform_admins (user_id)
values ('<your-auth-uid>');`}
        </pre>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <span className="rounded-md bg-ink px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-canvas">
          Operator
        </span>
        <nav className="flex gap-1 text-sm">
          <Link href="/admin/venues" className="rounded-lg px-3 py-1.5 text-muted transition hover:bg-canvas hover:text-ink">
            Venues
          </Link>
          <Link href="/admin/zones" className="rounded-lg px-3 py-1.5 text-muted transition hover:bg-canvas hover:text-ink">
            Safety zones
          </Link>
          <Link href="/admin/config" className="rounded-lg px-3 py-1.5 text-muted transition hover:bg-canvas hover:text-ink">
            Config
          </Link>
        </nav>
      </div>
      {children}
    </div>
  )
}
