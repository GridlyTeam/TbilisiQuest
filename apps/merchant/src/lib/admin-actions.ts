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
  /** Operator-set supply ceilings. A merchant cannot change these, and the
   *  database refuses a drop that exceeds them. */
  maxPerDrop: number
  monthlyAllowance: number
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
    p_max_per_drop: input.maxPerDrop,
    p_monthly: input.monthlyAllowance,
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
export type VenueAllowance = {
  max_per_drop: number
  monthly: number
  used: number
  remaining: number
}

export async function loadVenueAllowance(
  venueId: string,
): Promise<VenueAllowance | null> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('venue_allowance', {
    p_venue_id: venueId,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return (row as VenueAllowance) ?? null
}

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

// ---------------------------------------------------------------------------
// Venue analytics
// ---------------------------------------------------------------------------
// The merchant's own analytics page reads the drop_performance view, which RLS
// scopes to their venue. An operator cannot use it: the counts come from
// impressions, vouchers and redemptions, and those policies are staff-only, so
// the view would hand an admin a row per drop with every number at zero. These
// go through security-definer RPCs instead (migration 0019).
export type VenueAnalyticsRow = {
  venue_id: string
  name_ka: string
  name_en: string
  category: string
  venue_state: 'pending' | 'approved' | 'suspended'
  tier: 'basic' | 'premium'
  is_active: boolean
  drops_total: number
  drops_live: number
  map_views: number
  reveals: number
  claimed: number
  redeemed: number
  unique_visitors: number
  discount_value_gel: number | string | null
  conversion_pct: number | string | null
  abandonment_pct: number | string | null
  last_redeemed_at: string | null
}

export type VenueDropRow = {
  drop_id: string
  title_ka: string | null
  title_en: string | null
  rarity: 'common' | 'rare' | 'legendary'
  starts_at: string
  ends_at: string
  drop_state: string
  inventory_cap: number
  map_views: number
  reveals: number
  claimed: number
  redeemed: number
  foot_traffic_conversion_pct: number | string | null
  discount_value_gel: number | string | null
}

export async function loadVenueAnalytics(
  days = 30,
): Promise<VenueAnalyticsRow[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('admin_venue_analytics', {
    p_days: days,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as VenueAnalyticsRow[]
}

export async function loadVenueDrops(venueId: string): Promise<VenueDropRow[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('admin_venue_drops', {
    p_venue_id: venueId,
    p_limit: 25,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as VenueDropRow[]
}

// ---------------------------------------------------------------------------
// Player reports
// ---------------------------------------------------------------------------
export type Report = {
  id: string
  kind: 'unsafe_location' | 'venue_problem' | 'wrong_place' | 'other'
  note: string | null
  report_state: 'open' | 'reviewed' | 'actioned' | 'dismissed'
  created_at: string
  reporter_email: string
  reporter_status: 'active' | 'suspended' | 'banned'
  drop_id: string | null
  drop_title: string | null
  venue_id: string | null
  venue_name: string | null
  lat: number | null
  lng: number | null
  distance_m: number | string | null
  admin_notes: string | null
}

export async function loadReports(
  status?: Report['report_state'],
): Promise<Report[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('admin_list_reports', {
    p_status: status ?? null,
    p_limit: 100,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Report[]
}

export async function setReportStatus(
  reportId: string,
  status: Report['report_state'],
  notes?: string,
) {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('admin_set_report_status', {
    p_report_id: reportId,
    p_status: status,
    p_notes: notes ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reports')
}
