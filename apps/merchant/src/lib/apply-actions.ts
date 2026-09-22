'use server'

import { revalidatePath } from 'next/cache'

import { createServerSupabase } from './supabase-server'

/**
 * A merchant's route in: register, describe the business, wait for approval.
 *
 * Approval is what creates the venue (migration 0030). This is deliberate --
 * the pin decides where the app sends a teenager, and the voucher allowance is
 * the commercial lever, so neither is self-serve.
 */
export type Application = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  business_name: string
  admin_notes: string | null
  created_at: string
}

export async function submitApplication(input: {
  businessName: string
  category: string
  address: string
  phone?: string
  note?: string
}) {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('submit_venue_application', {
    p_business_name: input.businessName,
    p_category: input.category,
    p_address: input.address,
    p_phone: input.phone ?? null,
    p_note: input.note ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/apply')
}

export async function loadMyApplication(): Promise<Application | null> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('my_application')
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return (row as Application) ?? null
}

// ---------------------------------------------------------------------------
// Operator side
// ---------------------------------------------------------------------------
export type AdminApplication = {
  id: string
  user_id: string
  email: string
  business_name: string
  category: string
  address: string
  phone: string | null
  note: string | null
  app_status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  venue_id: string | null
  created_at: string
}

export async function loadApplications(): Promise<AdminApplication[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('admin_list_applications', {
    p_status: null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as AdminApplication[]
}

export async function approveApplication(input: {
  applicationId: string
  nameKa: string
  nameEn: string
  category: string
  lat: number
  lng: number
  addressEn?: string
  tier: 'basic' | 'premium'
  maxPerDrop: number
  monthlyAllowance: number
}) {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('admin_approve_application', {
    p_application_id: input.applicationId,
    p_name_ka: input.nameKa,
    p_name_en: input.nameEn,
    p_category: input.category,
    p_lat: input.lat,
    p_lng: input.lng,
    p_address_ka: null,
    p_address_en: input.addressEn ?? null,
    p_tier: input.tier,
    p_max_per_drop: input.maxPerDrop,
    p_monthly: input.monthlyAllowance,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/applications')
  revalidatePath('/admin/venues')
  return { venueId: data as string }
}

export async function rejectApplication(applicationId: string, notes?: string) {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('admin_reject_application', {
    p_application_id: applicationId,
    p_notes: notes ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/applications')
}
