import { createServerSupabase } from './supabase-server'

/**
 * Platform operators: GridlyTeam, not merchants.
 *
 * The check goes through the is_platform_admin() function rather than reading
 * the table, so the same predicate backs both the UI and every RLS policy.
 * A page that forgot this guard would still be refused by the database.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return data === true
}
