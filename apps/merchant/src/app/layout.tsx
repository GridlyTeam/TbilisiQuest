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

export const metadata: Metadata = {
  title: 'Tbilisi Quest — Merchant',
  description: 'Schedule off-peak voucher drops and track foot traffic.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ka" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
