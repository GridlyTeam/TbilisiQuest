import { createServerSupabase } from './supabase-server'

export type MerchantRole = 'owner' | 'manager' | 'cashier'

export type VenueMembership = {
  venueId: string
  role: MerchantRole
  nameEn: string
  nameKa: string
  subscriptionTier: 'basic' | 'premium'
}

/**
 * Every venue the signed-in person has any role at.
 *
 * RLS on merchant_users already restricts this to their own rows, so no extra
 * filtering is needed here -- the database will not return anyone else's
 * memberships even if this query asked for them.
 */
export async function getMemberships(): Promise<VenueMembership[]> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('merchant_users')
    .select('venue_id, role, venues(name_en, name_ka, subscription_tier)')

  if (error || !data) return []

  return data.flatMap((row) => {
    const venue = row.venues as unknown as {
      name_en: string
      name_ka: string
      subscription_tier: 'basic' | 'premium'
    } | null
    if (!venue) return []
    return [
      {
        venueId: row.venue_id as string,
        role: row.role as MerchantRole,
        nameEn: venue.name_en,
        nameKa: venue.name_ka,
        subscriptionTier: venue.subscription_tier,
      },
    ]
  })
}

/**
 * Resolves which venue a page should act on: the one named in the query string
 * if the person actually has a role there, otherwise their first membership.
 */
export async function resolveVenue(
  requested?: string,
): Promise<VenueMembership | null> {
  const memberships = await getMemberships()
  if (memberships.length === 0) return null
  if (!requested) return memberships[0]
  return memberships.find((m) => m.venueId === requested) ?? memberships[0]
}

/** Cashiers get the counter screen only; drop authoring needs manager or owner. */
export function canManageDrops(role: MerchantRole) {
  return role === 'owner' || role === 'manager'
}

export function canSeeRevenue(role: MerchantRole) {
  return role === 'owner' || role === 'manager'
}

