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
      className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-canvas"
    >
      Sign out
    </button>
  )
}
