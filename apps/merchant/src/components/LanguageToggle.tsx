'use client'

import { useI18n } from '@/lib/i18n'

export default function LanguageToggle() {
  const { locale, setLocale } = useI18n()

  return (
    <button
      onClick={() => setLocale(locale === 'ka' ? 'en' : 'ka')}
      className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas"
      // The label shows the language you would switch TO, which is the
      // convention people expect from a single-button toggle.
      aria-label={locale === 'ka' ? 'Switch to English' : 'ქართულზე გადართვა'}
    >
      {locale === 'ka' ? 'EN' : 'ქა'}
    </button>
  )
}
