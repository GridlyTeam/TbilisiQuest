import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * Supabase client for server components and server actions.
 *
 * Uses the anon key plus the caller's session cookie, never the service role
 * key. That matters: the service role bypasses RLS entirely, so a single
 * mistake in a server action would expose every venue's data. Running as the
 * signed-in user means the RLS policies in 0005 are enforced on every query,
 * and a manager at one venue cannot read another's analytics even if the code
 * asks for them.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session instead, so this is safe.
          }
        },
      },
    },
  )
}
