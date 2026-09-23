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
  /** 1 is an ordinary drop; above that, this many players must be at the venue
   *  together before anyone can claim. */
  squadSize: number
}

/**
 * Next.js replaces anything thrown from a server action with a generic error
 * and a digest before it reaches the browser -- that is what "Minified React
 * error #441" is. A message the merchant needs to read therefore has to be
 * RETURNED, not thrown.
 */
export type CreateDropResult =
  | { ok: true; dropId: string }
  | { ok: false; message: string }

export async function createDrop(
  input: CreateDropInput,
): Promise<CreateDropResult> {
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
      squad_size: input.squadSize,
      status: 'scheduled',
    })
    .select('id')
    .single()

  if (error) return { ok: false, message: explainDropError(error.message) }

  // Create the voucher rows before the drop is claimable. Doing this up front
  // is what lets claim_voucher() allocate with SKIP LOCKED instead of inserting
  // under contention.
  const { error: inventoryError } = await supabase.rpc('materialise_drop_inventory', {
    p_drop_id: drop.id,
  })

  if (inventoryError) {
    // Without inventory the drop would appear on the map and fail every claim.
    await supabase.from('drops').delete().eq('id', drop.id)
    return {
      ok: false,
      message: `Could not reserve inventory: ${inventoryError.message}`,
    }
  }

  revalidatePath('/drops')
  return { ok: true, dropId: drop.id as string }
}

/**
 * Record that a human has checked a drop's surroundings.
 *
 * "Every search radius is checked by hand before it goes live" only means
 * something if the check is attributable, so this records who signed it off and
 * when. RLS restricts the update to staff at that venue; the reviewer id comes
 * from the session rather than the request body.
 */
/**
 * Retired from the merchant portal in 0033: venue pins are operator-set and
 * cannot be moved, so a merchant marking their own drop "checked" verified
 * nothing. Kept because the database gate still exists and can be switched
 * back on (safety_config.require_manual_review) if drops are ever placed away
 * from venues.
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


/**
 * Turn a database refusal into something a merchant can act on.
 *
 * These constraints exist for good reasons, but their messages are written for
 * whoever wrote the schema. Left raw, they reach the client as an unhandled
 * server error -- React strips the text in production and shows "#441", which
 * tells nobody anything. The form validates the same rules first; this is the
 * backstop for the paths it cannot see.
 */
function explainDropError(raw: string): string {
  if (raw.includes('drops_rarity_matches_offer')) {
    return (
      'ეს შეთავაზება არ შეესაბამება არჩეულ იშვიათობას. ' +
      'Common: 5-40%, Rare: 1+1 ან 41-69%, Legendary: უფასო ან 70-100%.'
    )
  }
  if (raw.includes('OVER_PER_DROP_LIMIT')) {
    return 'ერთ დროფზე დაშვებულ ლიმიტს აჭარბებს.'
  }
  if (raw.includes('OVER_MONTHLY_ALLOWANCE')) {
    return 'თვიური ლიმიტი ამოწურულია.'
  }
  if (raw.includes('drops_window_valid')) {
    return 'დასრულების დრო დაწყებაზე გვიან უნდა იყოს.'
  }
  if (raw.includes('LOCATION_IS_OPERATOR_SET')) {
    return 'მდებარეობას მხოლოდ ოპერატორი ცვლის.'
  }
  return raw
}


/**
 * Light the venue up for a while.
 *
 * The beacon is the one thing a merchant can do between drops: it pushes their
 * live drop to players who have notifications on and marks the venue on the
 * map. Everything that decides whether they may -- ownership, the drop being
 * live, the 15 to 240 minute bounds -- is decided in the database, so this
 * only has to carry the refusal back to the button.
 */
export async function startBeacon(
  dropId: string,
  minutes: number,
): Promise<{ ok: true; until: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('start_beacon', {
    p_drop_id: dropId,
    p_minutes: minutes,
  })

  if (error) {
    // Thrown errors are masked in production, so every failure is returned.
    const message = error.message.includes('NOT_YOURS')
      ? 'That drop belongs to another venue.'
      : error.message.includes('DROP_NOT_LIVE')
        ? 'A beacon only works while the drop is live.'
        : error.message.includes('BEACON_LENGTH')
          ? 'A beacon runs between 15 and 240 minutes.'
          : 'The beacon could not start. Try again.'
    return { ok: false, message }
  }

  revalidatePath('/drops')
  return { ok: true, until: data as string }
}
