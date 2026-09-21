'use client'

import { useI18n } from '@/lib/i18n'
import LanguageToggle from './LanguageToggle'
import SignOutButton from './SignOutButton'

export default function NoVenueNotice({ userId }: { userId: string | null }) {
  const { t } = useI18n()

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900">{t('noVenue.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {t('noVenue.body')}
        </p>

        <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-left text-[11px] leading-relaxed text-neutral-100">
{`insert into public.merchant_users
  (user_id, venue_id, role)
values
  ('${userId ?? '<your-user-id>'}',
   '11111111-1111-1111-1111-111111111101',
   'owner');`}
        </pre>

        <p className="mt-3 text-xs text-neutral-500">{t('noVenue.hint')}</p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <LanguageToggle />
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
