'use client'

import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase-client'

export default function SignOutButton() {
  const router = useRouter()

  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut()
        router.push('/login')
        router.refresh()
      }}
      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 transition hover:bg-neutral-100"
    >
      Sign out
    </button>
  )
}
