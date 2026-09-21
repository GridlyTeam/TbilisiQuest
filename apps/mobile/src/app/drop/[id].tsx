import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useState, useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import { useLocation, distanceMeters } from '../../lib/useLocation'
import { useTheme, useRarity, radius, space, type Palette, type Rarity } from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


type DropDetail = {
  id: string
  title_ka: string
  title_en: string
  description_ka: string | null
  description_en: string | null
  rarity: Rarity
  offer: 'percent_off' | 'bogo' | 'free_item'
  discount_percent: number | null
  starts_at: string
  ends_at: string
  claim_radius_m: number
  reveal_radius_m: number
  venue_id: string
  venues: { name_ka: string; name_en: string } | null
}

type VenueCoords = { lat: number; lng: number }

function useCountdown(target: string | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!target) return null
  const ms = new Date(target).getTime() - now
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`
}

export default function DropDetailScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const rarity = useRarity()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { locale } = useTranslation()
  const { fix } = useLocation()

  const [drop, setDrop] = useState<DropDetail | null>(null)
  const [venueCoords, setVenueCoords] = useState<VenueCoords | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ka = locale === 'ka'

  const load = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase
      .from('drops')
      .select(
        'id, title_ka, title_en, description_ka, description_en, rarity, offer, discount_percent, starts_at, ends_at, claim_radius_m, reveal_radius_m, venue_id, venues(name_ka, name_en)',
      )
      .eq('id', id)
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const detail = data as unknown as DropDetail
    setDrop(detail)

    // venue_coords exposes lat/lng as plain numbers; querying venues.location
    // directly returns WKB hex, which is what broke the map markers.
    const { data: coords } = await supabase
      .from('venue_coords')
      .select('lat, lng')
      .eq('id', detail.venue_id)
      .maybeSingle()

    if (coords) setVenueCoords(coords as VenueCoords)

    const { count } = await supabase
      .from('vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('drop_id', id)
      .eq('status', 'available')

    setRemaining(count ?? 0)
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const distance =
    fix && venueCoords
      ? distanceMeters(fix.latitude, fix.longitude, venueCoords.lat, venueCoords.lng)
      : null

  const inRange = distance != null && drop ? distance <= drop.claim_radius_m : false
  const opensIn = useCountdown(drop?.starts_at)
  const endsIn = useCountdown(drop?.ends_at)
  const notYetOpen = opensIn != null

  async function claim() {
    if (!drop || !fix) return
    setClaiming(true)
    setError(null)

    const { error } = await supabase.rpc('claim_voucher', {
      p_drop_id: drop.id,
      p_lat: fix.latitude,
      p_lng: fix.longitude,
    })

    setClaiming(false)

    if (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setError(translateClaimError(error.message, ka))
      void load()
      return
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.replace('/vouchers')
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  if (!drop) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{error ?? (ka ? 'ვერ მოიძებნა' : 'Not found')}</Text>
      </View>
    )
  }

  const meta = rarity[drop.rarity] ?? rarity.common
  const title = ka ? drop.title_ka : drop.title_en
  const description = ka ? drop.description_ka : drop.description_en
  const venueName = ka ? drop.venues?.name_ka : drop.venues?.name_en
  const soldOut = remaining === 0

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={[styles.rarityPill, { backgroundColor: meta.glow, borderColor: meta.color }]}>
        <Text style={[styles.rarityText, { color: meta.color }]}>
          {meta.label[ka ? 'ka' : 'en'].toUpperCase()}
        </Text>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.venue}>{venueName}</Text>
      {description && <Text style={styles.description}>{description}</Text>}

      <View style={styles.statRow}>
        <Stat
          label={ka ? 'დარჩა' : 'Left'}
          value={remaining != null ? String(remaining) : '—'}
          tone={soldOut ? 'bad' : 'good'}
        />
        <Stat
          label={ka ? 'მანძილი' : 'Distance'}
          value={
            distance == null
              ? '—'
              : distance > 1000
                ? `${(distance / 1000).toFixed(1)} km`
                : `${Math.round(distance)} m`
          }
          tone={inRange ? 'good' : 'neutral'}
        />
        <Stat
          label={notYetOpen ? (ka ? 'იხსნება' : 'Opens in') : ka ? 'სრულდება' : 'Ends in'}
          value={notYetOpen ? (opensIn ?? '—') : (endsIn ?? '—')}
          tone="neutral"
        />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[
          styles.claimButton,
          (!inRange || soldOut || notYetOpen || claiming) && styles.claimDisabled,
        ]}
        onPress={claim}
        disabled={!inRange || soldOut || notYetOpen || claiming}
      >
        {claiming ? (
          <ActivityIndicator color={c.bg} />
        ) : (
          <Text style={styles.claimText}>
            {soldOut
              ? ka
                ? 'ამოიწურა'
                : 'Sold out'
              : notYetOpen
                ? ka
                  ? 'ჯერ არ დაწყებულა'
                  : 'Not open yet'
                : inRange
                  ? ka
                    ? 'აიღე ვაუჩერი'
                    : 'Claim voucher'
                  : ka
                    ? 'მიუახლოვდი'
                    : 'Get closer to claim'}
          </Text>
        )}
      </Pressable>

      {!inRange && !soldOut && distance != null && (
        <Text style={styles.hint}>
          {ka
            ? `უნდა იყო ${drop.claim_radius_m} მეტრში`
            : `You need to be within ${drop.claim_radius_m} m`}
        </Text>
      )}
    </ScrollView>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'bad' | 'neutral'
}) {
  const styles = useStyles()
  const { c } = useTheme()
  const color =
    tone === 'good' ? c.good : tone === 'bad' ? c.bad : c.text
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  )
}

function translateClaimError(raw: string, ka: boolean): string {
  const [code, detail] = raw.split(':')
  switch (code) {
    case 'SOLD_OUT':
      return ka ? 'ვაუჩერები ამოიწურა' : 'All gone'
    case 'ALREADY_CLAIMED':
      return ka ? 'უკვე აიღე ეს ვაუჩერი' : 'You already claimed this one'
    case 'OUT_OF_RANGE':
      return ka ? `ძალიან შორს ხარ (${detail} მ)` : `Too far away (${detail} m)`
    case 'NOT_YET_OPEN':
      return ka ? 'ჯერ არ დაწყებულა' : 'Not open yet'
    case 'DROP_EXPIRED':
      return ka ? 'ვადა გავიდა' : 'This drop has ended'
    default:
      return ka ? 'რაღაც ვერ გამოვიდა' : 'Something went wrong'
  }
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  content: { padding: space.xl, gap: space.md },
  centered: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rarityPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  rarityText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: c.text, fontSize: 28, fontWeight: '800' },
  venue: { color: c.accent, fontSize: 15, fontWeight: '600' },
  description: { color: c.textMuted, fontSize: 15, lineHeight: 22 },
  statRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  stat: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.md,
  },
  statLabel: { color: c.textFaint, fontSize: 11, textTransform: 'uppercase' },
  statValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  claimButton: {
    backgroundColor: c.accent,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.lg,
  },
  claimDisabled: { backgroundColor: c.surfaceRaised },
  claimText: { color: c.bg, fontSize: 17, fontWeight: '800' },
  hint: { color: c.textFaint, fontSize: 13, textAlign: 'center' },
  error: { color: c.bad, fontSize: 14 },
  muted: { color: c.textMuted },
})
