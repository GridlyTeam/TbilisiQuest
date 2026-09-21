'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useI18n } from '@/lib/i18n'
import LanguageToggle from './LanguageToggle'
import SignOutButton from './SignOutButton'

export default function DashboardNav({
  venueNameKa,
  venueNameEn,
  role,
  showManagement,
  isAdmin = false,
}: {
  venueNameKa: string
  venueNameEn: string
  role: string
  showManagement: boolean
  isAdmin?: boolean
}) {
  const { t, locale } = useI18n()
  const pathname = usePathname()
  const venueName = locale === 'ka' ? venueNameKa : venueNameEn

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <span className="text-sm font-semibold tracking-tight text-ink">
          Tbilisi Quest
        </span>

        <nav className="flex items-center gap-1 text-sm">
          {showManagement && (
            <NavLink href="/drops" active={pathname === '/drops'}>
              {t('nav.drops')}
            </NavLink>
          )}
          <NavLink href="/counter" active={pathname === '/counter'}>
            {t('nav.counter')}
          </NavLink>
          {showManagement && (
            <NavLink href="/analytics" active={pathname === '/analytics'}>
              {t('nav.analytics')}
            </NavLink>
          )}
          {isAdmin && (
            <NavLink href="/admin/venues" active={pathname.startsWith('/admin')}>
              Operator
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">
            {venueName} · {role}
          </span>
          <LanguageToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 transition ${
        active
          ? 'bg-ink text-white'
          : 'text-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
