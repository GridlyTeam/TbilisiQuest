import {
  Camera,
  Map as MapLibreMap,
  Marker,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import { useLocation, distanceMeters } from '../../lib/useLocation'
import { useSafetyGate } from '../../lib/useSafetyGate'
import SafetyOverlay from '../../components/SafetyOverlay'
import SafetyBriefing from '../../components/SafetyBriefing'
import SafetyButton from '../../components/SafetyButton'
import { useTheme, useRarity, radius, space, font, type Palette, type Rarity } from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


const TBILISI_CENTER: [number, number] = [44.7935, 41.6998]

/**
 * How close counts as "nearby" in the header.
 *
 * The map itself is queried over the whole city, so counting every marker it
 * returned told a player standing at home that 12 drops were nearby -- true of
 * Tbilisi, useless to them. 500 m is roughly a five-minute walk: near enough
 * that the number means "you could go now".
 */
const NEARBY_RADIUS_M = 500

/** Which rarity a shared marker should advertise. */
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, legendary: 2 }

type NearbyDrop = {
  id: string
  rarity: Rarity
  is_boss_chest: boolean
  distance_m: number
  starts_at: string
  ends_at: string
  remaining: number
  venue_name_ka: string | null
  venue_name_en: string | null
  title_ka: string | null
  title_en: string | null
  discount_percent: number | null
  squad_size: number
  lat: number
  lng: number
}

export default function MapScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { locale } = useTranslation()
  const { fix, permission, error } = useLocation()
  const safety = useSafetyGate(fix)
  const [drops, setDrops] = useState<NearbyDrop[]>([])
  const [loading, setLoading] = useState(true)
  // Set when a tapped marker holds more than one drop.
  const [picker, setPicker] = useState<NearbyDrop[] | null>(null)
  const lastQuery = useRef<{ lat: number; lng: number } | null>(null)
  const cameraRef = useRef<CameraRef>(null)
  const centredOnce = useRef(false)

  const ka = locale === 'ka'

  // Measured against the live fix rather than the RPC's distance_m, which was
  // computed from wherever the last query was made -- up to ~55 m stale, and
  // stale in exactly the moment a player is walking toward a drop.
  const { nearbyCount, nearestM } = useMemo(() => {
    if (!fix) return { nearbyCount: 0, nearestM: null as number | null }

    let nearest: number | null = null
    let count = 0
    for (const drop of drops) {
      if (drop.lat == null || drop.lng == null) continue
      const metres = distanceMeters(fix.latitude, fix.longitude, drop.lat, drop.lng)
      if (metres <= NEARBY_RADIUS_M) count += 1
      if (nearest === null || metres < nearest) nearest = metres
    }
    return { nearbyCount: count, nearestM: nearest }
  }, [drops, fix])

  const load = useCallback(async (lat: number, lng: number) => {
    const { data, error } = await supabase.rpc('nearby_drops', {
      p_lat: lat,
      p_lng: lng,
      p_radius: 30000,
    })
    setLoading(false)
    if (error) {
      console.warn('nearby_drops failed', error.message)
      return
    }
    setDrops((data ?? []) as NearbyDrop[])
  }, [])

  // Refetch when the player has actually moved. Re-querying on every GPS tick
  // would hammer the API while standing still and change nothing.
  useEffect(() => {
    if (!fix || safety.blocked) return
    const prev = lastQuery.current
    const moved =
      !prev ||
      Math.abs(prev.lat - fix.latitude) > 0.0005 ||
      Math.abs(prev.lng - fix.longitude) > 0.0005

    if (moved) {
      lastQuery.current = { lat: fix.latitude, lng: fix.longitude }
      void load(fix.latitude, fix.longitude)
    }
  }, [fix, load, safety.blocked])

  // Without a fix we still want a populated map, so fall back to the city
  // centre -- for a refused permission, and also when permission was granted
  // but no fix arrives. Indoors a phone can take a long time to see satellites,
  // and previously that left the map empty with no explanation.
  useEffect(() => {
    if (permission === 'denied') {
      void load(TBILISI_CENTER[1], TBILISI_CENTER[0])
      return
    }

    const timer = setTimeout(() => {
      if (!lastQuery.current) {
        void load(TBILISI_CENTER[1], TBILISI_CENTER[0])
      }
    }, 6000)

    return () => clearTimeout(timer)
  }, [permission, load])

  useEffect(() => {
    if (!fix || centredOnce.current) return
    centredOnce.current = true
    cameraRef.current?.easeTo({
      center: [fix.longitude, fix.latitude],
      zoom: 13,
      duration: 800,
    })
  }, [fix])

  /**
   * Drops at one venue share that venue's coordinates exactly, so two offers
   * from the same shop render as one marker sitting on top of another -- the
   * second is invisible and looks like it was never created. Group them by
   * position and render one marker per place.
   */
  const groups = useMemo(() => {
    const byPlace = new Map<string, NearbyDrop[]>()
    for (const drop of drops) {
      if (drop.lat == null || drop.lng == null) continue
      // Five decimals is roughly a metre: same shop, not same street.
      const key = `${drop.lat.toFixed(5)},${drop.lng.toFixed(5)}`
      const bucket = byPlace.get(key)
      if (bucket) bucket.push(drop)
      else byPlace.set(key, [drop])
    }
    return [...byPlace.values()]
  }, [drops])

  const recentre = useCallback(() => {
    if (!fix) return
    cameraRef.current?.easeTo({
      center: [fix.longitude, fix.latitude],
      zoom: 15,
      duration: 500,
    })
  }, [fix])



  return (
    <View style={styles.root}>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={c.mapStyle}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: TBILISI_CENTER, zoom: 12 }}
          minZoom={9}
          maxZoom={18}
        />
        {permission === 'granted' && <UserLocation animated accuracy />}

        {groups.map((group) => {
          // The marker wears the best thing on offer here: a shop with a
          // Legendary and a Common should glow gold, not grey.
          const best = [...group].sort(
            (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity],
          )[0]

          return (
            <Marker
              key={best.id}
              lngLat={[best.lng, best.lat]}
              onPress={() =>
                group.length === 1
                  ? router.push(`/drop/${best.id}`)
                  : setPicker(group)
              }
            >
              <DropMarker
                drop={best}
                count={group.length}
                totalRemaining={group.reduce((sum, d) => sum + (d.remaining ?? 0), 0)}
                ka={ka}
              />
            </Marker>
          )
        })}
      </MapLibreMap>

      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerCard}>
          {/* The count is the whole message, so it is the whole design: one
              big numeral, a small wide-tracked label, and the instruction
              underneath in the quietest weight on the screen. */}
          <View style={styles.headerRow}>
            <Text style={styles.headerCount}>
              {loading ? '·' : nearbyCount}
            </Text>

            <View style={styles.headerText}>
              <Text style={styles.headerLabel}>
                {loading
                  ? ka ? 'იტვირთება' : 'Loading'
                  : ka
                    ? 'დროფი ახლოს'
                    : nearbyCount === 1
                      ? 'drop nearby'
                      : 'drops nearby'}
              </Text>

              <Text style={styles.headerSub}>
                {nearbyCount > 0
                  ? ka
                    ? 'მიუახლოვდი 20 მ-ზე ასაღებად'
                    : 'Get within 20 m to claim'
                  : nearestM != null
                    ? ka
                      ? `უახლოესი დროფი ${formatDistance(nearestM, true)}-ზეა`
                      : `Nearest drop is ${formatDistance(nearestM, false)} away`
                    : ka
                      ? 'მიუახლოვდი 20 მ-ზე ასაღებად'
                      : 'Get within 20 m to claim'}
              </Text>

              {!loading && drops.length === 0 && (
                <Text style={styles.headerWarn}>
                  {ka
                    ? 'აქტიური დროფი არ არის - შეამოწმე დრო და მიმოხილვა'
                    : 'No live drops right now'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {error && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {ka
              ? 'ჩართე ლოკაცია დროფების სანახავად'
              : 'Enable location to find drops near you'}
          </Text>
        </View>
      )}

      {loading && !safety.blocked && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={c.accent} />
        </View>
      )}

      {/* Always reachable, over the map and under the safety overlay. */}
      {!safety.blocked && (
        <View style={styles.controls}>
          {fix && (
            <Pressable
              style={styles.recentre}
              onPress={recentre}
              accessibilityRole="button"
              accessibilityLabel={ka ? 'ჩემს ადგილას' : 'Centre on me'}
            >
              <Text style={styles.recentreIcon}>◎</Text>
            </Pressable>
          )}
          <SafetyButton fix={fix} />
        </View>
      )}

      <Modal
        visible={picker != null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>
              {(ka ? picker?.[0]?.venue_name_ka : picker?.[0]?.venue_name_en) ??
                (ka ? 'შეთავაზებები' : 'Offers')}
            </Text>

            <ScrollView style={styles.pickerList}>
              {picker?.map((drop) => (
                <PickerRow
                  key={drop.id}
                  drop={drop}
                  ka={ka}
                  onPress={() => {
                    setPicker(null)
                    router.push(`/drop/${drop.id}`)
                  }}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <SafetyOverlay safety={safety} />
      <SafetyBriefing />
    </View>
  )
}

/**
 * Every drop is a storefront now: the icon carries the shop, the rarity ring
 * carries how good the offer is, and the badge carries scarcity. Scarcity is
 * the thing that actually moves someone off a sofa, so it gets the loudest
 * treatment of the three.
 */
function DropMarker({
  drop,
  count,
  totalRemaining,
  ka,
}: {
  drop: NearbyDrop
  /** How many drops share this position. */
  count: number
  /** Vouchers left across all of them -- what a player can actually walk away
   *  with from this shop. */
  totalRemaining: number
  ka: boolean
}) {
  const styles = useStyles()
  const rarity = useRarity()
  const meta = rarity[drop.rarity] ?? rarity.common
  const size = drop.is_boss_chest ? 74 : 58
  const venueName = (ka ? drop.venue_name_ka : drop.venue_name_en) ?? ''
  const soldOut = totalRemaining === 0
  const squad = (drop.squad_size ?? 1) > 1
  const stacked = count > 1

  return (
    <View style={styles.markerWrap}>
      <View
        style={[
          styles.badge,
          { backgroundColor: soldOut ? styles.badgeSoldOut.color : meta.color },
        ]}
      >
        <Text style={styles.badgeText}>
          {soldOut
            ? ka
              ? 'ვაუჩერები ამოიწურა'
              : 'No vouchers left'
            : ka
              ? `დარჩა ${totalRemaining} ვოუჩერი`
              : `${totalRemaining} voucher${totalRemaining === 1 ? '' : 's'} left`}
        </Text>
      </View>

      <View
        style={[
          styles.iconRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: meta.color,
            shadowColor: meta.color,
            opacity: soldOut ? 0.45 : 1,
          },
        ]}
      >
        <Image
          source={require('../../../assets/store-icon-192.png')}
          style={{ width: size * 0.82, height: size * 0.82 }}
          resizeMode="contain"
        />

        {/* Corner pill rather than another line of text: a squad drop has to
            be recognisable at a glance from across the map, before anyone
            walks anywhere. */}
        {squad && (
          <View style={[styles.squadPip, { borderColor: meta.color }]}>
            <Text style={styles.squadPipText}>{drop.squad_size}x</Text>
          </View>
        )}

        {/* How many separate offers this shop is running. Bottom right, in the
            brand amber, so it reads as a quantity attached to the shop rather
            than as another rarity signal. */}
        {stacked && (
          <View style={styles.offerCount}>
            <Text style={styles.offerCountText}>{count}</Text>
          </View>
        )}
      </View>

      {venueName.length > 0 && (
        <View style={styles.markerLabel}>
          <Text style={styles.markerLabelText} numberOfLines={1}>
            {venueName}
          </Text>
        </View>
      )}
    </View>
  )
}

function PickerRow({
  drop,
  ka,
  onPress,
}: {
  drop: NearbyDrop
  ka: boolean
  onPress: () => void
}) {
  const styles = useStyles()
  const rarity = useRarity()
  const meta = rarity[drop.rarity] ?? rarity.common
  const soldOut = drop.remaining === 0

  return (
    <Pressable
      style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={soldOut}
    >
      <View style={[styles.pickerDot, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerRowTitle} numberOfLines={1}>
          {(ka ? drop.title_ka : drop.title_en) ?? ''}
        </Text>
        <Text style={styles.pickerRowMeta}>
          {meta.label[ka ? 'ka' : 'en']}
          {' · '}
          {soldOut
            ? ka ? 'ამოიწურა' : 'Sold out'
            : ka
              ? `დარჩა ${drop.remaining}`
              : `${drop.remaining} left`}
        </Text>
      </View>
    </Pressable>
  )
}

/** Metres under a kilometre, kilometres above it -- "1400 m" reads as noise. */
function formatDistance(metres: number, ka: boolean): string {
  return metres < 1000
    ? `${Math.round(metres)} ${ka ? 'მ' : 'm'}`
    : `${(metres / 1000).toFixed(1)} ${ka ? 'კმ' : 'km'}`
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },

  header: { position: 'absolute', top: 56, left: space.lg, right: space.lg },
  headerCard: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerCount: {
    color: c.accent,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -2,
    // Optical centring: a numeral sits high in its line box next to caps.
    marginTop: -4,
    minWidth: 38,
    textAlign: 'center',
  },
  headerText: { flex: 1, gap: 1 },
  headerLabel: {
    color: c.text,
    fontSize: font.eyebrow.fontSize,
    fontWeight: font.eyebrow.fontWeight,
    letterSpacing: font.eyebrow.letterSpacing,
    textTransform: 'uppercase',
  },
  headerSub: { color: c.textMuted, fontSize: 12.5 },
  headerWarn: { color: c.accentInk, fontSize: 12, marginTop: 1, fontWeight: '700' },

  footer: {
    position: 'absolute',
    bottom: space.xl,
    left: space.lg,
    right: space.lg,
    backgroundColor: c.bad,
    borderRadius: radius.md,
    padding: space.md,
  },
  footerText: { color: '#FFFFFF', fontSize: 13, textAlign: 'center' },

  controls: {
    position: 'absolute',
    bottom: space.lg,
    right: space.lg,
    alignItems: 'flex-end',
    gap: space.md,
  },
  recentre: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  recentreIcon: { color: c.accentInk, fontSize: 22, fontWeight: '700' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  markerWrap: { alignItems: 'center' },
  iconRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: c.surface,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 7,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: 4,
    alignItems: 'center',
  },
  badgeText: {
    color: '#12101C',
    fontSize: 10.5,
    fontWeight: '800',
  },
  badgeSoldOut: { color: c.textFaint },
  pickerBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: c.border,
    padding: space.xl,
    paddingBottom: space.xxl,
    gap: space.md,
    maxHeight: '70%',
  },
  pickerTitle: {
    color: c.text,
    fontSize: font.heading.fontSize,
    fontWeight: font.heading.fontWeight,
    letterSpacing: font.heading.letterSpacing,
  },
  pickerList: { flexGrow: 0 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  pickerDot: { width: 10, height: 10, borderRadius: 5 },
  pickerRowTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  pickerRowMeta: { color: c.textMuted, fontSize: 12, marginTop: 1 },
  squadPip: {
    position: 'absolute',
    left: -6,
    bottom: -2,
    backgroundColor: c.bg,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  squadPipText: {
    color: c.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  offerCount: {
    position: 'absolute',
    right: -5,
    bottom: -3,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.accent,
    borderWidth: 2,
    borderColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  offerCountText: {
    color: '#08060F',
    fontSize: 12,
    fontWeight: '900',
  },
  markerLabel: {
    marginTop: 4,
    alignSelf: 'center',
    maxWidth: 120,
    backgroundColor: c.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  markerLabelText: { color: c.text, fontSize: 10, fontWeight: '600' },
})
