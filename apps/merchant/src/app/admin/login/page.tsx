'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase-client'

/**
 * The operator entrance.
 *
 * Deliberately separate from the merchant sign-in, and deliberately plain: no
 * sign-up, no language toggle, no branding. Operators are a handful of people
 * who know the URL. Anyone who reaches it without being one gets the same
 * refusal the database would give them.
 *
 * Note the /admin/login route sits outside the (dashboard) group so it is not
 * wrapped in the operator chrome it is trying to let you into.
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setBusy(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    // Whether this account is actually an operator is decided by the admin
    // area itself, which asks the database. Sending them there either way
    // means this page never has to know.
    router.push('/admin/venues')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-8"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
          Tbilisi Quest
        </p>
        <h1 className="mt-1 text-lg font-semibold text-neutral-100">
          Operator sign in
        </h1>

        <label className="mt-6 block space-y-1">
          <span className="block text-xs text-neutral-400">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        </label>

        <label className="mt-3 block space-y-1">
          <span className="block text-xs text-neutral-400">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
        </label>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
