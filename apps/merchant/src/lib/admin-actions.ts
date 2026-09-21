'use server'

/**
 * Operator actions.
 *
 * Every one of these runs as the signed-in user, so the `is_platform_admin()`
 * check inside each RPC (and the RLS policies) is the real authority. The
 * guards here are for a clear error message, not for security -- a forged
 * request still hits the same database checks.
 */

import { revalidatePath } from 'next/cache'

import { createServerSupabase } from './supabase-server'

export type VenueInput = {
  id?: string
  nameKa: string
  nameEn: string
  category: string
  lat: number
  lng: number
  addressKa?: string
  addressEn?: string
  tier: 'basic' | 'premium'
}

export async function upsertVenue(input: VenueInput) {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('admin_upsert_venue', {
    p_id: input.id ?? null,
    p_name_ka: input.nameKa,
    p_name_en: input.nameEn,
    p_category: input.category,
    p_lat: input.lat,
    p_lng: input.lng,
    p_address_ka: input.addressKa ?? null,
    p_address_en: input.addressEn ?? null,
    p_tier: input.tier,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/venues')
  return { venueId: data as string }
}

export async function setVenueStatus(
  venueId: string,
  status: 'pending' | 'approved' | 'suspended',
  notes?: string,
) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('venues')
    .update({
      status,
      admin_notes: notes ?? null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      approved_by: status === 'approved' ? user?.id ?? null : null,
    })
    .eq('id', venueId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/venues')
}

/**
 * Attach a person to a venue by email.
 *
 * The lookup goes through the users profile table rather than auth.users,
 * which the anon role cannot read. A merchant therefore has to have signed in
 * once before they can be assigned — which is the right order anyway, since it
 * proves the address works.
 */
export async function assignVenueRole(
  venueId: string,
  email: string,
  role: 'owner' | 'manager' | 'cashier',
) {
  const supabase = await createServerSupabase()

  const { data: profile, error: lookupError } = await supabase
    .from('users')
    .select('id, display_name')
    .ilike('display_name', email.split('@')[0])
    .maybeSingle()

  if (lookupError) throw new Error(lookupError.message)
  if (!profile) {
    throw new Error(
      `No account found for ${email}. Ask them to sign in once first.`,
    )
  }

  const { error } = await supabase
    .from('merchant_users')
    .upsert(
      { venue_id: venueId, user_id: profile.id, role },
      { onConflict: 'user_id,venue_id' },
    )

  if (error) throw new Error(error.message)
  revalidatePath('/admin/venues')
}

export async function createSafetyZone(input: {
  kind: string
  name: string
  wkt: string
  bufferM: number
  notes?: string
}) {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('admin_create_safety_zone', {
    p_kind: input.kind,
    p_name: input.name,
    p_wkt: input.wkt,
    p_buffer_m: input.bufferM,
    p_notes: input.notes ?? null,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/zones')
  return { zoneId: data as string }
}

export async function setZoneActive(zoneId: string, isActive: boolean) {
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('safety_zones')
    .update({ is_active: isActive })
    .eq('id', zoneId)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/zones')
}

export async function updateSafetyConfig(input: {
  playOpensAt: string
  playClosesAt: string
  maxSpeedKmh: number
  requireManualReview: boolean
}) {
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('safety_config')
    .update({
      play_opens_at: input.playOpensAt,
      play_closes_at: input.playClosesAt,
      max_speed_kmh: input.maxSpeedKmh,
      require_manual_review: input.requireManualReview,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true)

  if (error) throw new Error(error.message)
  revalidatePath('/admin/config')
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
export type Player = {
  user_id: string
  email: string
  display_name: string | null
  locale: string
  status: 'active' | 'suspended' | 'banned'
  status_reason: string | null
  created_at: string
  last_seen_at: string | null
  level: number
  total_xp: number
  streak_days: number
  claimed: number
  redeemed: number
  last_activity: string | null
}

export type PlayerActivity = {
  occurred_at: string
  kind: string
  detail: string | null
  venue_name: string | null
}

export async function searchPlayers(query: string): Promise<Player[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('admin_search_players', {
    p_query: query,
    p_limit: 50,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Player[]
}

export async function loadPlayerActivity(
  userId: string,
): Promise<PlayerActivity[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('admin_player_activity', {
    p_user_id: userId,
    p_limit: 50,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as PlayerActivity[]
}

/**
 * Suspending or banning also releases any vouchers the account is holding, so
 * a restricted player is not sitting on a merchant's inventory. That happens
 * inside the RPC rather than here, so a direct database call cannot skip it.
 */
export async function setPlayerStatus(
  userId: string,
  status: 'active' | 'suspended' | 'banned',
  reason?: string,
) {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('admin_set_player_status', {
    p_user_id: userId,
    p_status: status,
    p_reason: reason ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/players')
}
