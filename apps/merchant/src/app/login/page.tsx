'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n'
import LanguageToggle from '@/components/LanguageToggle'
import { resolveHome } from '@/lib/home-action'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  // The landing page links straight to registration, so the form opens on the
  // tab the visitor asked for. Read after mount rather than with
  // useSearchParams(): that hook opts the route out of prerendering unless it
  // is wrapped in Suspense, and this is a detail, not a reason to restructure
  // the page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'signup') setMode('signup')
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)

    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setBusy(false)

    if (error) {
      setError(error.message)
      return
    }

    // Whether signUp returns a session depends on the project's email
    // confirmation setting. With confirmations on there is no session yet and
    // redirecting would just bounce back to this page, so check rather than
    // assume.
    if (!data.session) {
      setNotice(t('auth.confirmEmail'))
      setMode('signin')
      return
    }

    // Merchants, operators and players share one login now; ask the server
    // where this account actually belongs.
    const home = await resolveHome()
    router.push(home)
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Tbilisi Quest</h1>
          <p className="mt-1 text-sm text-muted">{t('nav.subtitle')}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium">{t('auth.email')}</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm outline-none focus:border-indigo focus:ring-1 focus:ring-indigo"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="block text-sm font-medium">{t('auth.password')}</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm outline-none focus:border-indigo focus:ring-1 focus:ring-indigo"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-danger px-3 py-2 text-sm text-danger-ink">{error}</p>
          )}
          {notice && (
            <p className="rounded-lg bg-live px-3 py-2 text-sm text-live-ink">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-40"
          >
            {busy
              ? t('auth.working')
              : mode === 'signin'
                ? t('auth.signIn')
                : t('auth.createAccount')}
          </button>

          {/* No toggle to sign-up from here. The form still opens in that
              mode when ?mode=signup is on the URL, which is how an operator
              hands a vetted shop its own way in -- but the page offers it to
              nobody who was not sent the link. */}
          {mode === 'signup' && (
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setError(null)
                setNotice(null)
              }}
              className="w-full text-center text-xs text-muted hover:text-ink"
            >
              {t('auth.haveAccount')}
            </button>
          )}
        </form>

        <div className="mt-6 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </main>
  )
}
