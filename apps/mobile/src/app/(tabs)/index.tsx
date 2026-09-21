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
import { useTheme, useRarity, radius, space, type Palette, type Rarity } from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


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
  /** Metres within which the true position lies. Zero once revealed. */
  uncertainty_m: number
}

/**
 * Web-Mercator ground resolution. A circle drawn at this size covers the same
 * patch of city at every zoom, so zooming in magnifies the uncertainty instead
 * of narrowing it -- which is what previously gave the exact spot away.
 */
function metresToPixels(metres: number, latitude: number, zoom: number): number {
  const metresPerPixel =
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom)
  return metres / metresPerPixel
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
  const [zoom, setZoom] = useState(12)
  const centredOnce = useRef(false)

  const ka = locale === 'ka'

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

  const revealed = drops.filter((d) => d.revealed).length

  return (
    <View style={styles.root}>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={c.mapStyle}
        onRegionIsChanging={(e) => {
          const next = e.nativeEvent?.zoom
          if (typeof next === 'number') setZoom(next)
        }}
        onRegionDidChange={(e) => {
          const next = e.nativeEvent?.zoom
          if (typeof next === 'number') setZoom(next)
        }}
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
            <Marker key={drop.id} lngLat={[drop.lng, drop.lat]}>
              <DropMarker
                drop={drop}
                ka={ka}
                zoom={zoom}
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
          {!loading && drops.length === 0 && (
            <Text style={styles.headerWarn}>
              {ka
                ? 'აქტიური დროფი არ არის — შეამოწმე დრო და მიმოხილვა'
                : 'No live drops right now'}
            </Text>
          )}
          <Text style={styles.headerSub}>
            {revealed > 0
              ? ka
                ? `${revealed} გახსნილი`
                : `${revealed} revealed`
              : ka
                ? 'იდუმალი ნიშნები — მიუახლოვდი 100 მ-ზე'
                : 'Mystery markers — get within 100 m'}
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
 * Fog of war made visual: an unrevealed drop shows only a rarity-tinted question
 * mark. The server has already stripped the venue and offer from the payload,
 * so there is nothing to render even if someone patched this component.
 */
function DropMarker({
  drop,
  ka,
  zoom,
  onPress,
}: {
  drop: NearbyDrop
  ka: boolean
  zoom: number
  onPress: () => void
}) {
  const styles = useStyles()
  const { c } = useTheme()
  const rarity = useRarity()
  const meta = rarity[drop.rarity] ?? rarity.common

  // A revealed drop is a pin: fixed size, exact position. An unrevealed one is
  // an area of uncertainty, so its circle is drawn to scale and shrinks only as
  // the player physically closes in and the server narrows the cell.
  const size = drop.revealed
    ? drop.is_boss_chest
      ? 56
      : 44
    : Math.max(
        32,
        Math.min(280, metresToPixels(drop.uncertainty_m * 2, drop.lat, zoom)),
      )

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
            // Undiscovered drops carry their rarity colour at low opacity, so
            // the tint is legible while the map still reads through it.
            // Revealing fills the circle solid, making discovery a visible
            // change rather than a text swap.
            backgroundColor: drop.revealed ? meta.color : meta.fill,
            shadowColor: meta.color,
            shadowOpacity: drop.revealed ? 0.8 : 0.45,
          },
        ]}
      >
        <Text
          style={[
            styles.markerText,
            { color: drop.revealed ? c.bg : meta.color },
            !drop.revealed && styles.markerTextGhost,
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

  marker: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowRadius: 8,
    elevation: 6,
  },
  markerText: { fontWeight: '800', fontSize: 14 },
  // A question mark with weight but not full presence: legible against either
  // basemap without competing with revealed markers.
  markerTextGhost: { opacity: 0.85, fontSize: 18 },
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
