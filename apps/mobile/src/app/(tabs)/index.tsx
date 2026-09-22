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
  Pressable,
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
import EmergencyButton from '../../components/EmergencyButton'
import { useTheme, useRarity, radius, space, type Palette, type Rarity } from '../../lib/theme'

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

        {drops.map((drop) => {
          if (drop.lat == null || drop.lng == null) return null
          return (
            <Marker
              key={drop.id}
              lngLat={[drop.lng, drop.lat]}
              onPress={() => router.push(`/drop/${drop.id}`)}
            >
              <DropMarker drop={drop} ka={ka} />
            </Marker>
          )
        })}
      </MapLibreMap>

      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>
            {loading
              ? ka
                ? 'იტვირთება…'
                : 'Loading…'
              : ka
                ? `${nearbyCount} დროფი ახლოს`
                : `${nearbyCount} drop${nearbyCount === 1 ? '' : 's'} nearby`}
          </Text>
          {!loading && drops.length === 0 && (
            <Text style={styles.headerWarn}>
              {ka
                ? 'აქტიური დროფი არ არის — შეამოწმე დრო და მიმოხილვა'
                : 'No live drops right now'}
            </Text>
          )}
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
          <EmergencyButton />
        </View>
      )}

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
function DropMarker({ drop, ka }: { drop: NearbyDrop; ka: boolean }) {
  const styles = useStyles()
  const rarity = useRarity()
  const meta = rarity[drop.rarity] ?? rarity.common
  const size = drop.is_boss_chest ? 74 : 58
  const venueName = (ka ? drop.venue_name_ka : drop.venue_name_en) ?? ''
  const soldOut = drop.remaining === 0

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
              ? `${drop.remaining} ვაუჩერი დარჩა`
              : `${drop.remaining} voucher${drop.remaining === 1 ? '' : 's'} left`}
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
  headerTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  headerSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  headerWarn: { color: c.accentInk, fontSize: 12, marginTop: 2, fontWeight: '600' },

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
