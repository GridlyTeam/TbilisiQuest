import type { Metadata } from 'next'
import { Noto_Sans_Georgian } from 'next/font/google'
import './globals.css'

import { I18nProvider } from '@/lib/i18n'

/**
 * Noto Sans Georgian covers both scripts, so Georgian and English render in the
 * same typeface at the same weights. Geist (the Next starter default) has no
 * Georgian glyphs at all, which would have dumped every Georgian string into
 * whatever fallback the OS happened to pick.
 */
const sans = Noto_Sans_Georgian({
  variable: '--font-sans',
  subsets: ['georgian', 'latin'],
  display: 'swap',
})

/**
 * One site, so the title is the product rather than the portal. The tab icon
 * comes from src/app/icon.png, which is the same mark the phone app uses --
 * Next picks that file up by convention, no link tag needed.
 */
export const metadata: Metadata = {
  title: {
    default: 'Tbilisi Quest',
    template: '%s · Tbilisi Quest',
  },
  description:
    'ყოველდღე 14:00-დან თბილისში ჩნდება ვაუჩერები. იპოვე რუკაზე, მიდი ადგილზე, წაიღე. · Real discounts around Tbilisi, claimed on foot.',
  openGraph: {
    title: 'Tbilisi Quest',
    description:
      'ყოველდღე 14:00-დან თბილისში ჩნდება ვაუჩერები. იპოვე რუკაზე, მიდი ადგილზე, წაიღე.',
    images: ['/og.png'],
    type: 'website',
  },
}

// themeColor belongs to the viewport export in the App Router, not to
// metadata; Next warns on every route otherwise.
export const viewport = { themeColor: '#08060f' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ka" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
