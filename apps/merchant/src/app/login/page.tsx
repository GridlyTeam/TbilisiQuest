'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n'
import LanguageToggle from '@/components/LanguageToggle'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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

    router.push('/drops')
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

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setNotice(null)
            }}
            className="w-full text-center text-xs text-muted hover:text-ink"
          >
            {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}
          </button>
        </form>

        <div className="mt-6 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </main>
  )
}
