import { useCallback, useState, useMemo } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import GeofencedScannerScreen from '../../screens/GeofencedScannerScreen'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import { useTheme, useRarity, radius, space, type Palette, type Rarity } from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


type VoucherRow = {
  id: string
  redemption_code: string
  status: 'held' | 'redeemed' | 'expired' | 'released' | 'available'
  hold_expires_at: string | null
  drops: {
    title_ka: string
    title_en: string
    rarity: Rarity
    claim_radius_m: number
    venues: {
      id: string
      name_ka: string
      name_en: string
    } | null
  } | null
}

export default function VouchersScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const rarity = useRarity()
  const { locale } = useTranslation()
  const [rows, setRows] = useState<VoucherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scanning, setScanning] = useState<VoucherRow | null>(null)
  const [coordsByVenue, setCoordsByVenue] = useState<
    Record<string, { lat: number; lng: number }>
  >({})

  const ka = locale === 'ka'

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('vouchers')
      .select(
        'id, redemption_code, status, hold_expires_at, drops(title_ka, title_en, rarity, claim_radius_m, venues(id, name_ka, name_en))',
      )
      .in('status', ['held', 'redeemed'])
      .order('claimed_at', { ascending: false })
      .limit(50)

    setLoading(false)
    setRefreshing(false)
    if (error) {
      console.warn('vouchers load failed', error.message)
      return
    }
    const list = (data ?? []) as unknown as VoucherRow[]
    setRows(list)

    // Coordinates come from venue_coords as plain numbers: querying
    // venues.location directly returns WKB hex, which the scanner cannot use.
    const ids = [...new Set(list.map((r) => r.drops?.venues?.id).filter(Boolean))]
    if (ids.length > 0) {
      const { data: coords } = await supabase
        .from('venue_coords')
        .select('id, lat, lng')
        .in('id', ids as string[])

      const map: Record<string, { lat: number; lng: number }> = {}
      for (const c of coords ?? []) {
        map[c.id as string] = { lat: c.lat as number, lng: c.lng as number }
      }
      setCoordsByVenue(map)
    }
  }, [])

  // Tabs stay mounted, so a plain mount effect never re-runs after the claim
  // screen routes here -- the list would still show whatever it held when the
  // tab was first opened. Reloading on focus is what makes a fresh claim
  // appear immediately.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (scanning) {
    const venue = scanning.drops?.venues
    const coords = venue ? coordsByVenue[venue.id] : undefined

    if (!venue || !coords) {
      setScanning(null)
      return null
    }

    return (
      <GeofencedScannerScreen
        voucher={{
          id: scanning.id,
          redemptionCode: scanning.redemption_code,
          titleKa: scanning.drops?.title_ka ?? '',
          titleEn: scanning.drops?.title_en ?? '',
          holdExpiresAt: scanning.hold_expires_at ?? '',
        }}
        venue={{
          id: venue.id,
          nameKa: venue.name_ka,
          nameEn: venue.name_en,
          latitude: coords.lat,
          longitude: coords.lng,
          claimRadiusM: scanning.drops?.claim_radius_m ?? 20,
        }}
        onRedeemed={() => {
          setScanning(null)
          void load()
        }}
        onCancel={() => setScanning(null)}
      />
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(row) => row.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            void load()
          }}
          tintColor={c.accent}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {ka ? 'ვაუჩერები არ გაქვს' : 'No vouchers yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {ka
              ? 'იპოვე დროფი რუკაზე და მიუახლოვდი'
              : 'Find a drop on the map and walk up to it'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const meta = rarity[item.drops?.rarity ?? 'common']
        const redeemed = item.status === 'redeemed'
        return (
          <Pressable
            style={[styles.card, redeemed && styles.cardUsed]}
            disabled={redeemed}
            onPress={() => setScanning(item)}
          >
            <View style={[styles.stripe, { backgroundColor: meta.color }]} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {ka ? item.drops?.title_ka : item.drops?.title_en}
              </Text>
              <Text style={styles.cardVenue} numberOfLines={1}>
                {ka ? item.drops?.venues?.name_ka : item.drops?.venues?.name_en}
              </Text>
            </View>
            <Text style={[styles.cardAction, redeemed && styles.cardActionUsed]}>
              {redeemed ? (ka ? 'გამოყენებული' : 'Used') : ka ? 'სკანირება' : 'Scan'}
            </Text>
          </Pressable>
        )
      }}
    />
  )
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  content: { padding: space.lg, gap: space.md, flexGrow: 1 },
  centered: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  cardUsed: { opacity: 0.45 },
  stripe: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: space.lg },
  cardTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  cardVenue: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  cardAction: {
    color: c.accent,
    fontWeight: '700',
    fontSize: 13,
    paddingRight: space.lg,
  },
  cardActionUsed: { color: c.textFaint },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emptyTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
  emptyBody: { color: c.textMuted, fontSize: 14, textAlign: 'center' },
})
