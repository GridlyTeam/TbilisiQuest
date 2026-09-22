'use client'

import { useState } from 'react'

import { submitApplication, type Application } from '@/lib/apply-actions'
import SignOutButton from './SignOutButton'

const CATEGORIES = [
  'cafe',
  'bar',
  'bakery',
  'restaurant',
  'salon',
  'shop',
  'cinema',
  'gaming',
  'other',
]

/**
 * The merchant's application.
 *
 * Short on purpose: five fields, none of them a commitment. What the operator
 * actually needs in order to decide is the address and what kind of place it
 * is; everything else is a conversation.
 */
export default function ApplyForm({
  existing,
  email,
}: {
  existing: Application | null
  email: string
}) {
  const [values, setValues] = useState({
    businessName: '',
    category: 'cafe',
    address: '',
    phone: '',
    note: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(existing?.status === 'pending')

  if (sent || existing?.status === 'pending') {
    return (
      <Shell email={email}>
        <h1 className="text-xl font-semibold text-ink">განაცხადი მიღებულია</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          თქვენს განაცხადს განვიხილავთ და დაგიკავშირდებით. დამტკიცების შემდეგ
          ავტომატურად გაიხსნება თქვენი პორტალი.
        </p>
        <p className="mt-4 text-xs text-faint">
          We&apos;ll review your application and get in touch. Your portal opens
          automatically once it is approved.
        </p>
      </Shell>
    )
  }

  if (existing?.status === 'rejected') {
    return (
      <Shell email={email}>
        <h1 className="text-xl font-semibold text-ink">განაცხადი არ დამტკიცდა</h1>
        {existing.admin_notes && (
          <p className="mt-2 rounded-lg bg-warn px-3 py-2 text-sm text-warn-ink">
            {existing.admin_notes}
          </p>
        )}
        <p className="mt-3 text-sm text-muted">
          დაგვიკავშირდით, თუ ფიქრობთ, რომ ეს შეცდომაა.
        </p>
      </Shell>
    )
  }

  return (
    <Shell email={email}>
      <h1 className="text-xl font-semibold text-ink">დაარეგისტრირე შენი ადგილი</h1>
      <p className="mt-1 text-sm text-muted">
        შეავსე მოკლე ფორმა. ჩვენ შევამოწმებთ და გავხსნით პორტალს.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await submitApplication(values)
            setSent(true)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="ბიზნესის სახელი">
          <input
            required
            value={values.businessName}
            onChange={(e) => setValues({ ...values, businessName: e.target.value })}
            className={input}
          />
        </Field>

        <Field label="კატეგორია">
          <select
            value={values.category}
            onChange={(e) => setValues({ ...values, category: e.target.value })}
            className={input}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="მისამართი">
          <input
            required
            value={values.address}
            onChange={(e) => setValues({ ...values, address: e.target.value })}
            placeholder="მაგ: აღმაშენებლის 140"
            className={input}
          />
        </Field>

        <Field label="ტელეფონი">
          <input
            value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })}
            className={input}
          />
        </Field>

        <Field label="რისი შეთავაზება გსურთ? (სურვილისამებრ)">
          <textarea
            rows={3}
            maxLength={800}
            value={values.note}
            onChange={(e) => setValues({ ...values, note: e.target.value })}
            placeholder="მაგ: ყავა -30% 14:00-17:00"
            className={input}
          />
        </Field>

        {error && <p className="text-sm text-danger-ink">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'იგზავნება…' : 'გაგზავნა'}
        </button>
      </form>
    </Shell>
  )
}

const input =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-neutral-900 outline-none focus:border-indigo'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
        {children}
        <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
          <span className="text-xs text-faint">{email}</span>
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
