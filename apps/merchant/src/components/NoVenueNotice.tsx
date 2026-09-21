'use client'

import { useI18n } from '@/lib/i18n'
import LanguageToggle from './LanguageToggle'
import SignOutButton from './SignOutButton'

export default function NoVenueNotice({ userId }: { userId: string | null }) {
  const { t } = useI18n()

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-ink">{t('noVenue.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t('noVenue.body')}
        </p>

        <pre className="mt-4 overflow-x-auto rounded-lg bg-ink p-3 text-left text-[11px] leading-relaxed text-canvas">
{`insert into public.merchant_users
  (user_id, venue_id, role)
values
  ('${userId ?? '<your-user-id>'}',
   '11111111-1111-1111-1111-111111111101',
   'owner');`}
        </pre>

        <p className="mt-3 text-xs text-muted">{t('noVenue.hint')}</p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <LanguageToggle />
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
