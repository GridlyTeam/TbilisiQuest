import {
  Camera,
  Map as MapLibreMap,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import { useLocation } from '../../lib/useLocation'
import { useSafetyGate } from '../../lib/useSafetyGate'
import SafetyOverlay from '../../components/SafetyOverlay'
import SafetyBriefing from '../../components/SafetyBriefing'
import EmergencyButton from '../../components/EmergencyButton'
import { colors, radius, rarity, space, type Rarity } from '../../lib/theme'

/**
 * Free vector tiles, no account or API key. Dark to match the app and because
 * a dark basemap makes the rarity-coloured markers the brightest thing on
 * screen, which is exactly where attention should go.
 */
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const TBILISI_CENTER: [number, number] = [44.7935, 41.6998]

type NearbyDrop = {
  id: string
  rarity: Rarity
  is_boss_chest: boolean
  distance_m: number
  revealed: boolean
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
  const router = useRouter()
  const { locale } = useTranslation()
  const { fix, permission, error } = useLocation()
  const safety = useSafetyGate(fix)
  const [drops, setDrops] = useState<NearbyDrop[]>([])
  const [loading, setLoading] = useState(true)
  const lastQuery = useRef<{ lat: number; lng: number } | null>(null)

  const ka = locale === 'ka'

  const load = useCallback(async (lat: number, lng: number) => {
    const { data, error } = await supabase.rpc('nearby_drops', {
      p_lat: lat,
      p_lng: lng,
      p_radius: 5000,
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

  // Without a fix we still want a populated map, so fall back to the city centre.
  useEffect(() => {
    if (permission === 'denied') {
      void load(TBILISI_CENTER[1], TBILISI_CENTER[0])
    }
  }, [permission, load])

  const revealed = drops.filter((d) => d.revealed).length

  return (
    <View style={styles.root}>
      <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE}>
        <Camera
          center={fix ? [fix.longitude, fix.latitude] : TBILISI_CENTER}
          zoom={14}
        />
        {permission === 'granted' && <UserLocation animated accuracy />}

        {drops.map((drop) => {
          if (drop.lat == null || drop.lng == null) return null
          return (
            <Marker key={drop.id} lngLat={[drop.lng, drop.lat]}>
              <DropMarker
                drop={drop}
                ka={ka}
                onPress={() => router.push(`/drop/${drop.id}`)}
              />
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
                ? `${drops.length} დროფი ახლოს`
                : `${drops.length} drops nearby`}
          </Text>
          <Text style={styles.headerSub}>
            {revealed > 0
              ? ka
                ? `${revealed} გახსნილი`
                : `${revealed} revealed`
              : ka
                ? 'მიუახლოვდი გასახსნელად'
                : 'Walk closer to reveal'}
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
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {/* Always reachable, over the map and under the safety overlay. */}
      {!safety.blocked && (
        <View style={styles.emergency}>
          <EmergencyButton />
        </View>
      )}

      <SafetyOverlay safety={safety} />
      <SafetyBriefing />
    </View>
  )
}

/**
 * Fog of war made visual: an unrevealed drop shows only a rarity-tinted question
 * mark. The server has already stripped the venue and offer from the payload,
 * so there is nothing to render even if someone patched this component.
 */
function DropMarker({
  drop,
  ka,
  onPress,
}: {
  drop: NearbyDrop
  ka: boolean
  onPress: () => void
}) {
  const meta = rarity[drop.rarity] ?? rarity.common
  const size = drop.is_boss_chest ? 56 : 44

  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <View
        style={[
          styles.marker,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: meta.color,
            backgroundColor: drop.revealed ? meta.color : colors.surface,
            shadowColor: meta.color,
          },
        ]}
      >
        <Text
          style={[
            styles.markerText,
            { color: drop.revealed ? colors.bg : meta.color },
          ]}
        >
          {drop.revealed
            ? drop.discount_percent
              ? `${drop.discount_percent}%`
              : '★'
            : '?'}
        </Text>
      </View>

      {drop.revealed && (
        <View style={styles.markerLabel}>
          <Text style={styles.markerLabelText} numberOfLines={1}>
            {(ka ? drop.venue_name_ka : drop.venue_name_en) ?? ''}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: { position: 'absolute', top: 56, left: space.lg, right: space.lg },
  headerCard: {
    backgroundColor: 'rgba(30,30,38,0.94)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  headerSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  footer: {
    position: 'absolute',
    bottom: space.xl,
    left: space.lg,
    right: space.lg,
    backgroundColor: 'rgba(122,38,38,0.94)',
    borderRadius: radius.md,
    padding: space.md,
  },
  footerText: { color: colors.text, fontSize: 13, textAlign: 'center' },

  emergency: {
    position: 'absolute',
    bottom: space.lg,
    left: space.lg,
    right: space.lg,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  marker: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  markerText: { fontWeight: '800', fontSize: 14 },
  markerLabel: {
    marginTop: 4,
    alignSelf: 'center',
    maxWidth: 120,
    backgroundColor: 'rgba(20,20,26,0.9)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  markerLabelText: { color: colors.text, fontSize: 10, fontWeight: '600' },
})
