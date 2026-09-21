'use server'

/**
 * Server actions for the merchant portal.
 *
 * These run on the server with the merchant's session cookie, so Supabase RLS
 * still applies -- a manager at venue A physically cannot write a drop for
 * venue B even if they forge the request body, because the RLS policy on
 * `drops` checks has_venue_role() against auth.uid().
 */

import { revalidatePath } from 'next/cache'
import { fromZonedTime } from 'date-fns-tz'

import { createServerSupabase } from './supabase-server'

type CreateDropInput = {
  venueId: string
  timezone: string
  titleKa: string
  titleEn: string
  descriptionKa?: string
  descriptionEn?: string
  rarity: 'common' | 'rare' | 'legendary'
  offer: 'percent_off' | 'bogo' | 'free_item'
  discountPercent?: number
  faceValueGel: number
  date: string
  startTime: string
  endTime: string
  inventoryCap: number
  earlyAccessLevel: number
  earlyAccessMinutes: number
  isBossChest: boolean
}

export async function createDrop(input: CreateDropInput) {
  const supabase = await createServerSupabase()

  // The merchant picked "14:00" meaning 14:00 in Tbilisi, not 14:00 UTC. Storing
  // the wrong instant here would silently shift every drop by four hours, so the
  // conversion happens once, server-side, against the venue's own timezone.
  const startsAt = fromZonedTime(`${input.date}T${input.startTime}:00`, input.timezone)
  const endsAt = fromZonedTime(`${input.date}T${input.endTime}:00`, input.timezone)

  if (endsAt <= startsAt) {
    throw new Error('End time must be after start time')
  }
  if (endsAt <= new Date()) {
    throw new Error('That window has already passed')
  }

  // Premium-only feature, re-checked server-side. The disabled checkbox in the
  // UI is a convenience, not a control.
  let isBossChest = input.isBossChest
  if (isBossChest) {
    const { data: venue } = await supabase
      .from('venues')
      .select('subscription_tier')
      .eq('id', input.venueId)
      .single()
    if (venue?.subscription_tier !== 'premium') {
      isBossChest = false
    }
  }

  const { data: drop, error } = await supabase
    .from('drops')
    .insert({
      venue_id: input.venueId,
      title_ka: input.titleKa,
      title_en: input.titleEn,
      description_ka: input.descriptionKa ?? null,
      description_en: input.descriptionEn ?? null,
      rarity: input.rarity,
      offer: input.offer,
      discount_percent: input.offer === 'percent_off' ? input.discountPercent : null,
      face_value_gel: input.faceValueGel,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      inventory_cap: input.inventoryCap,
      early_access_level: input.earlyAccessLevel,
      early_access_minutes: input.earlyAccessMinutes,
      is_boss_chest: isBossChest,
      status: 'scheduled',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Create the voucher rows before the drop is claimable. Doing this up front
  // is what lets claim_voucher() allocate with SKIP LOCKED instead of inserting
  // under contention.
  const { error: inventoryError } = await supabase.rpc('materialise_drop_inventory', {
    p_drop_id: drop.id,
  })

  if (inventoryError) {
    // Without inventory the drop would appear on the map and fail every claim.
    await supabase.from('drops').delete().eq('id', drop.id)
    throw new Error(`Could not reserve inventory: ${inventoryError.message}`)
  }

  revalidatePath('/drops')
  return { dropId: drop.id as string }
}

/**
 * Record that a human has checked a drop's surroundings.
 *
 * "Every search radius is checked by hand before it goes live" only means
 * something if the check is attributable, so this records who signed it off and
 * when. RLS restricts the update to staff at that venue; the reviewer id comes
 * from the session rather than the request body.
 */
export async function markDropReviewed(dropId: string, notes?: string) {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase
    .from('drops')
    .update({
      safety_reviewed_at: new Date().toISOString(),
      safety_reviewed_by: user.id,
      safety_notes: notes ?? null,
    })
    .eq('id', dropId)

  if (error) throw new Error(error.message)

  revalidatePath('/drops')
}
