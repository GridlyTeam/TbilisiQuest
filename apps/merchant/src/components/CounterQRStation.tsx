'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n'

/**
 * The tablet screen that sits on the counter.
 *
 * Shows a QR the customer's phone scans to complete a redemption. The code is
 * derived server-side from the venue secret and the current 30-second window,
 * so it rotates continuously -- a photograph of this screen is worthless within
 * half a minute, which is what stops codes being shared in group chats.
 *
 * Designed for a tablet left running all day: large, high contrast, no
 * interaction required, and it recovers on its own if the network blips.
 */
export default function CounterQRStation({
  venueId,
  venueNameKa,
  venueNameEn,
}: {
  venueId: string
  venueNameKa: string
  venueNameEn: string
}) {
  const { t, locale } = useI18n()
  const venueName = locale === 'ka' ? venueNameKa : venueNameEn
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(30)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function refresh() {
      const { data, error } = await supabase.rpc('current_counter_code', {
        p_venue_id: venueId,
      })
      if (cancelled) return
      if (error) {
        setError(error.message)
        return
      }
      setError(null)
      setCode(data as string)
    }

    void refresh()

    // Align refreshes to the server's 30-second window boundaries rather than
    // to when this component happened to mount, so the displayed code changes
    // at the same instant the server's window rolls over.
    const tick = setInterval(() => {
      const elapsed = Math.floor(Date.now() / 1000) % 30
      setSecondsLeft(30 - elapsed)
      if (elapsed === 0) void refresh()
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(tick)
    }
  }, [venueId])

  const payload = code ? `tq:${venueId}:${code}` : null

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{venueName}</h1>
        <p className="mt-2 text-muted">{t('counter.instruction')}</p>
      </div>

      <div className="rounded-3xl border border-line bg-surface p-8 shadow-sm">
        {error ? (
          <div className="flex h-[300px] w-[300px] items-center justify-center text-center text-sm text-danger-ink">
            {error}
          </div>
        ) : payload ? (
          <QRCodeSVG
            value={payload}
            size={300}
            level="M"
            marginSize={0}
            // Deliberately plain black on white: tablet screens at an angle
            // under café lighting are the worst case for scan reliability, and
            // maximum contrast is what fixes it.
            fgColor="#000000"
            bgColor="#ffffff"
          />
        ) : (
          <div className="h-[300px] w-[300px] animate-pulse rounded-xl bg-canvas" />
        )}
      </div>

      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="tabular-nums">
          {t('counter.refreshesIn', { seconds: secondsLeft })}
        </span>
      </div>

      <p className="max-w-sm text-center text-xs leading-relaxed text-faint">
        {t('counter.note')}
      </p>
    </div>
  )
}
