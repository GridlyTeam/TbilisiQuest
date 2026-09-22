import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import { useTheme, space, type Palette } from '../../lib/theme'
import GeofencedScannerScreen from '../../screens/GeofencedScannerScreen'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Row = {
  id: string
  redemption_code: string | null
  hold_expires_at: string | null
  drops: {
    title_ka: string | null
    title_en: string | null
    claim_radius_m: number
  } | null
}

/**
 * Scan a voucher by id, reached straight from the claim.
 *
 * A player has to be within the claim radius to claim at all, so by the time
 * they hold a voucher they are standing in the shop. Sending them back to the
 * Vouchers tab to find the thing they just won is a detour with no purpose;
 * this route lets the reward flow run claim -> scan -> done in one line.
 *
 * The venue position comes from voucher_venue(), which only answers for a
 * voucher the caller actually holds -- the same rule the Vouchers tab relies
 * on, rather than a second way in.
 */
export default function ScanVoucherScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [row, setRow] = useState<Row | null>(null)
  const [venue, setVenue] = useState<{
    id: string
    nameKa: string
    nameEn: string
    latitude: number
    longitude: number
  } | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const [voucherRes, venueRes] = await Promise.all([
      supabase
        .from('vouchers')
        .select(
          'id, redemption_code, hold_expires_at, drops(title_ka, title_en, claim_radius_m)',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('voucher_venue', { p_voucher_id: id }),
    ])

    const venueRow = Array.isArray(venueRes.data)
      ? venueRes.data[0]
      : venueRes.data

    if (!voucherRes.data || !venueRow) {
      setFailed(true)
      return
    }

    setRow(voucherRes.data as unknown as Row)
    setVenue({
      id: venueRow.venue_id as string,
      nameKa: venueRow.venue_name_ka as string,
      nameEn: venueRow.venue_name_en as string,
      latitude: venueRow.lat as number,
      longitude: venueRow.lng as number,
    })
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (failed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>
          {ka ? 'ვაუჩერი ვერ მოიძებნა' : 'Voucher not found'}
        </Text>
      </View>
    )
  }

  if (!row || !venue) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  return (
    <GeofencedScannerScreen
      voucher={{
        id: row.id,
        redemptionCode: row.redemption_code ?? '',
        titleKa: row.drops?.title_ka ?? '',
        titleEn: row.drops?.title_en ?? '',
        holdExpiresAt: row.hold_expires_at ?? '',
      }}
      venue={{
        id: venue.id,
        nameKa: venue.nameKa,
        nameEn: venue.nameEn,
        latitude: venue.latitude,
        longitude: venue.longitude,
        claimRadiusM: row.drops?.claim_radius_m ?? 20,
      }}
      onRedeemed={() => router.replace('/vouchers')}
      onCancel={() => router.replace('/vouchers')}
    />
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.md,
    },
    text: { color: c.textMuted, fontSize: 15 },
  })
