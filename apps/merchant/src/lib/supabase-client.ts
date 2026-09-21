'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for client components.
 *
 * Writes the session to cookies rather than localStorage so server components
 * and server actions can read it too -- that is what lets RLS apply on the
 * server without passing tokens around by hand.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
