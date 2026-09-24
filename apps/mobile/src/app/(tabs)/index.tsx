import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native'
import { useFocusEffect, useRouter } from 'expo-router'
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
import { useLocation, distanceMeters, type Fix } from '../../lib/useLocation'
import { useSafetyGate } from '../../lib/useSafetyGate'
import SafetyOverlay from '../../components/SafetyOverlay'
import SafetyBriefing from '../../components/SafetyBriefing'
import SafetyButton from '../../components/SafetyButton'
import UserPuck from '../../components/UserPuck'
import HeadBox from '../../components/HeadBox'
import StorePanel from '../../components/StorePanel'
import Creature from '../../components/Creature'
import Stage from '../../components/Stage'
import { StoreIcon } from '../../components/TabIcons'
import { useTheme, useRarity, radius, space, font, type Palette, type Rarity } from '../../lib/theme'

type NearbyPlayer = {
  player_id: string
  display_name: string
  avatar_config: { colour?: string } | null
  lat: number
  lng: number
  approximate: boolean
}

type PlayerCard = {
  display_name: string
  avatar_config: { colour?: string } | null
  background_key: string | null
  level: number
  season_xp: number
  /** Absent for your own card: your position is not approximated to you. */
  approximate?: boolean
  isMe?: boolean
}

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

/**
 * How close the camera sits when it is showing you yourself.
 *
 * The first centring used to land two zoom levels further out than the
 * recentre button, so opening the map put your own dot somewhere in the
 * distance and pressing the button was the only way to get the view you
 * actually wanted. Both use this.
 */
const FOCUS_ZOOM = 15

/** UserPuck's own box. Its dot sits in the middle of this, not at the bottom. */
const PUCK_BOX = 66

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
  // The recentre button is only useful when the map is somewhere else. It
  // hides once the camera is on the player and comes back the moment they pan
  // or zoom away -- a control that does nothing is just clutter over the map.
  const [centred, setCentred] = useState(true)
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

  // Refetch on a timer as well as on movement. Drops appear, sell out and
  // expire while the app sits open on a table, and a map that only re-queries
  // when the player walks 50 metres shows a city that stopped changing when
  // they stopped moving -- including a drop created a minute ago, which is
  // exactly what a merchant does while watching their phone.
  useEffect(() => {
    if (!fix || safety.blocked) return
    const timer = setInterval(() => {
      void load(fix.latitude, fix.longitude)
    }, 60_000)
    return () => clearInterval(timer)
  }, [fix, load, safety.blocked])

  // And whenever the map comes back into view, so switching tabs is a refresh.
  useFocusEffect(
    useCallback(() => {
      if (!fix || safety.blocked) return
      void load(fix.latitude, fix.longitude)
    }, [fix, load, safety.blocked]),
  )

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
      zoom: FOCUS_ZOOM,
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

  // Other players, and our own position going the other way.
  //
  // Everything about who may be seen and how precisely is decided in the
  // database -- see migration 0040. What arrives here for a public player is
  // already displaced by 300-500 m, so there is no exact position in this
  // process to leak. The app's only job is to draw it and say it is
  // approximate.
  const [players, setPlayers] = useState<NearbyPlayer[]>([])
  const [card, setCard] = useState<PlayerCard | null>(null)
  const [myColour, setMyColour] = useState<string | null>(null)
  const [myName, setMyName] = useState<string | null>(null)
  const [storeOpen, setStoreOpen] = useState(false)

  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [{ data }, auth] = await Promise.all([
        supabase.rpc('my_avatar'),
        supabase.auth.getUser(),
      ])
      const row = (Array.isArray(data) ? data[0] : data) as
        | { avatar_config: { colour?: string } | null; display_name: string | null }
        | undefined
      setMyColour(row?.avatar_config?.colour ?? null)
      setMyName(row?.display_name ?? null)
      setMyId(auth.data.user?.id ?? null)
    })()
  }, [])

  // A ref rather than a dependency on `fix` itself: watchPositionAsync emits
  // roughly every 4-10 seconds while walking, and an effect keyed on the fix
  // object tears down and restarts on every one of those -- the interval below
  // never gets 30 seconds to live, and heartbeat_position ends up firing on
  // nearly every GPS tick instead. Keying on presence alone lets the interval
  // run on its own clock and read whatever position is newest when it fires.
  const latestFix = useRef<Fix | null>(null)
  useEffect(() => {
    latestFix.current = fix
  }, [fix])

  const hasFix = fix != null
  useEffect(() => {
    if (!hasFix) return
    let cancelled = false

    const tick = async () => {
      const current = latestFix.current
      if (!current) return
      await supabase.rpc('heartbeat_position', {
        p_lat: current.latitude,
        p_lng: current.longitude,
      })
      const { data } = await supabase.rpc('nearby_players', {
        p_lat: current.latitude,
        p_lng: current.longitude,
        p_radius_m: 3000,
      })
      if (!cancelled) setPlayers((data as NearbyPlayer[]) ?? [])
    }

    void tick()
    const timer = setInterval(() => void tick(), 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [hasFix])

  const openCard = useCallback(
    async (userId: string, approximate: boolean, isMe = false) => {
      const { data } = await supabase.rpc('player_card', { p_user_id: userId })
      const row = (Array.isArray(data) ? data[0] : data) as PlayerCard | undefined
      // A player who went ghost between the list arriving and the tap simply
      // has no card; saying nothing is better than saying they vanished.
      if (row) setCard({ ...row, approximate, isMe })
    },
    [],
  )

  // Your own bubble. The id is resolved at press time if the lookup on mount
  // has not landed yet, so a slow first request cannot leave it dead.
  const openOwnCard = useCallback(async () => {
    const id = myId ?? (await supabase.auth.getUser()).data.user?.id
    if (!id) return
    if (!myId) setMyId(id)
    await openCard(id, false, true)
  }, [myId, openCard])

  const recentre = useCallback(() => {
    if (!fix) return
    setCentred(true)
    cameraRef.current?.easeTo({
      center: [fix.longitude, fix.latitude],
      zoom: FOCUS_ZOOM,
      duration: 500,
    })
  }, [fix])



  return (
    <View style={styles.root}>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={c.mapStyle}
        // MapLibre's logo and its attribution "i" sat in the corners under our
        // own controls, and two info buttons on one screen is one too many.
        // The credit they carry moved into the safety sheet.
        logo={false}
        attribution={false}
        // Only a gesture un-centres the map; our own easeTo calls fire this
        // too, and treating those as "the player moved the map" would make
        // the button reappear the instant it was pressed.
        onRegionDidChange={(event) => {
          if (event.nativeEvent.userInteraction) setCentred(false)
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: TBILISI_CENTER, zoom: 12 }}
          minZoom={9}
          maxZoom={18}
        />
        {/* Our own puck rather than the library's: same position, brand
            colour, and a pulse. See components/UserPuck. */}
        {permission === 'granted' && fix && (
          <Marker
            lngLat={[fix.longitude, fix.latitude]}
            // Anchored at the bottom and pushed back down by half the puck's
            // own box: UserPuck is 66px tall with its dot centred, so with the
            // default centre anchor the dot landed well below the position it
            // was marking and the bubble floated a long way above it.
            anchor="bottom"
            offset={[0, PUCK_BOX / 2]}
            // The Marker's own press, not a Pressable inside it: on Android
            // these are native views placed on the map projection and the
            // map's gestures swallow touches aimed at React children, which
            // is why tapping your own bubble did nothing while tapping
            // everybody else's worked.
            onPress={openOwnCard}
          >
            {/* The dot stays the dot -- it is the accurate thing on the screen
                -- and the head box sits above it, the same box other players
                see. */}
            <View style={styles.selfMarker}>
              {/* Tucked down over the puck's empty upper half so the tail
                  ends just above the dot rather than a puck-height away. */}
              <View style={styles.selfBubble}>
                <HeadBox colour={myColour} name={myName} size={44} />
              </View>
              <UserPuck />
            </View>
          </Marker>
        )}

        {/* Other people, under the drops: a voucher is what the map is for,
            and a head box should never sit over one. */}
        {players.map((player) => (
          <Marker
            key={player.player_id}
            lngLat={[player.lng, player.lat]}
            // The tail points at the position, so the bubble's bottom is the
            // anchor rather than its middle.
            anchor="bottom"
            onPress={() => openCard(player.player_id, player.approximate)}
          >
            <HeadBox
              colour={player.avatar_config?.colour}
              name={player.display_name}
              dimmed={player.approximate}
            />
          </Marker>
        ))}

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
                    ? 'ვაუჩერი ახლოს'
                    : nearbyCount === 1
                      ? 'voucher nearby'
                      : 'vouchers nearby'}
              </Text>

              <Text style={styles.headerSub}>
                {nearbyCount > 0
                  ? ka
                    ? 'მიუახლოვდი 20 მ-ზე ასაღებად'
                    : 'Get within 20 m to claim'
                  : nearestM != null
                    ? ka
                      ? `უახლოესი ვაუჩერი ${formatDistance(nearestM, true)}-ზეა`
                      : `Nearest drop is ${formatDistance(nearestM, false)} away`
                    : ka
                      ? 'მიუახლოვდი 20 მ-ზე ასაღებად'
                      : 'Get within 20 m to claim'}
              </Text>

              {!loading && drops.length === 0 && (
                <Text style={styles.headerWarn}>
                  {ka
                    ? 'აქტიური ვაუჩერი არ არის - შეამოწმე დრო და მიმოხილვა'
                    : 'No live vouchers right now'}
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
              ? 'ჩართე ლოკაცია ვაუჩერების სანახავად'
              : 'Enable location to find vouchers near you'}
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
        <>
          {/* The store lives down here rather than in the tab bar: it is
              somewhere you drop into when you have coins, not one of the four
              things the app is for. Pressing the button again puts it away. */}
          <View style={styles.controlsLeft}>
            {storeOpen && <StorePanel onClose={() => setStoreOpen(false)} />}
            <Pressable
              style={[styles.storeButton, storeOpen && styles.storeButtonOpen]}
              onPress={() => setStoreOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: storeOpen }}
              accessibilityLabel={ka ? 'მაღაზია' : 'Store'}
            >
              <StoreIcon color={storeOpen ? c.bg : c.accentInk} size={18} />
            </Pressable>
          </View>

          <View style={styles.controls}>
            {fix && !centred && (
              <Pressable
                style={styles.recentre}
                onPress={recentre}
                accessibilityRole="button"
                accessibilityLabel={ka ? 'ჩემს ადგილას' : 'Centre on me'}
              >
                <Crosshair color={c.accentInk} />
              </Pressable>
            )}
            <SafetyButton fix={fix} />
          </View>
        </>
      )}

      <Modal
        visible={card != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCard(null)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setCard(null)}>
          <Pressable style={styles.cardSheet} onPress={(e) => e.stopPropagation()}>
            {card && (
              <>
                {/* The whole character on its stage, not a cropped face: the
                    reason to tap somebody is to see what they are wearing. */}
                <View style={styles.cardStage}>
                  <Stage
                    background={card.background_key}
                    tint={card.avatar_config?.colour}
                    height={230}
                    ka={ka}
                    sparkle={false}
                  >
                    <Creature colour={card.avatar_config?.colour} size={150} />
                  </Stage>
                </View>

                <Text style={styles.cardName}>{card.display_name}</Text>
                <Text style={styles.cardMeta}>
                  {ka
                    ? `დონე ${card.level} - ${card.season_xp} XP სეზონზე`
                    : `Level ${card.level} - ${card.season_xp} XP this season`}
                </Text>
                {/* Said plainly, because an icon that hops 400 m with no
                    explanation is read as a broken map. */}
                {card.approximate === true && (
                  <Text style={styles.cardApprox}>
                    {ka
                      ? 'ადგილი მიახლოებითია - ზუსტი ადგილი არავის უჩანს'
                      : 'Location is approximate - exact positions are never shown'}
                  </Text>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
/**
 * The recentre control's mark.
 *
 * Drawn from views rather than set as a character: the old ◎ rendered as
 * whatever the system font felt like, which on Android is a thin circle that
 * reads as a smudge at this size. Four ticks and a ring is unambiguous at any
 * scale and costs nothing.
 */
function Crosshair({ color }: { color: string }) {
  const ring = {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.8,
    borderColor: color,
  }
  const tick = { position: 'absolute' as const, backgroundColor: color }

  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={ring} />
      <View style={{ position: 'absolute', width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: color }} />
      <View style={[tick, { top: 0, width: 1.8, height: 5 }]} />
      <View style={[tick, { bottom: 0, width: 1.8, height: 5 }]} />
      <View style={[tick, { left: 0, height: 1.8, width: 5 }]} />
      <View style={[tick, { right: 0, height: 1.8, width: 5 }]} />
    </View>
  )
}

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
  const { c } = useTheme()
  const rarity = useRarity()
  const meta = rarity[drop.rarity] ?? rarity.common
  const size = drop.is_boss_chest ? 74 : 58
  const venueName = (ka ? drop.venue_name_ka : drop.venue_name_en) ?? ''
  const soldOut = totalRemaining === 0
  const squad = (drop.squad_size ?? 1) > 1
  const stacked = count > 1

  return (
    <View style={styles.markerWrap}>
      {/* A neutral plate with the rarity in the ink and the border, rather
          than a saturated fill. Bright cyan or amber behind small text is
          hard to look at on a map you are scanning, and the colour reads
          just as clearly as an outline. */}
      <View
        style={[
          styles.badge,
          !soldOut && { borderColor: meta.color },
        ]}
      >
        <Text
          style={[
            styles.badgeText,
            { color: soldOut ? c.textMuted : meta.color },
          ]}
        >
          {soldOut
            ? ka
              ? 'ვაუჩერები ამოიწურა'
              : 'No vouchers left'
            : ka
              ? `დარჩა ${totalRemaining} ვაუჩერი`
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
    letterSpacing: 0,
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
    letterSpacing: 0,
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
  controlsLeft: {
    position: 'absolute',
    bottom: space.lg,
    left: space.lg,
    alignItems: 'flex-start',
    gap: space.md,
  },
  storeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  storeButtonOpen: { backgroundColor: c.accent, borderColor: c.accent },
  recentre: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
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
  // Map labels sit on whatever the basemap draws -- pale streets, dark parks,
  // a river. Neither a light nor a dark text colour survives all of it, so
  // both plates are opaque and carry a contrasting ring, and the text colour
  // is chosen against the plate rather than against the map.
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 5,
    alignItems: 'center',
    backgroundColor: c.isDark ? 'rgba(10,8,19,0.92)' : 'rgba(255,255,255,0.96)',
    borderWidth: 1.5,
    borderColor: c.border,
    shadowColor: '#000',
    shadowOpacity: c.isDark ? 0.5 : 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  badgeSoldOut: { color: c.isDark ? '#2A2440' : '#D8D3E0' },
  pickerBackdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  selfMarker: { alignItems: 'center' },
  selfBubble: { marginBottom: -PUCK_BOX * 0.34 },
  cardSheet: {
    margin: space.lg,
    marginBottom: space.xl,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.lg,
    alignItems: 'center',
    gap: space.sm,
  },
  cardStage: { alignSelf: 'stretch', marginBottom: space.xs },
  cardName: { color: c.text, fontSize: 20, fontWeight: '900', letterSpacing: 0 },
  cardMeta: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
  cardApprox: {
    color: c.textFaint,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: space.xs,
  },
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
    letterSpacing: 0,
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
    color: c.isDark ? '#F7F5FF' : '#171526',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  offerCount: {
    position: 'absolute',
    right: -5,
    bottom: -3,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.isDark ? 'rgba(10,8,19,0.95)' : 'rgba(255,255,255,0.98)',
    borderWidth: 2,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  offerCountText: {
    color: c.accentInk,
    fontSize: 12,
    fontWeight: '900',
  },
  markerLabel: {
    marginTop: 5,
    alignSelf: 'center',
    maxWidth: 132,
    backgroundColor: c.isDark ? 'rgba(10,8,19,0.92)' : 'rgba(255,255,255,0.96)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.isDark ? 'rgba(247,245,255,0.18)' : 'rgba(23,21,38,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: '#000',
    shadowOpacity: c.isDark ? 0.55 : 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  markerLabelText: {
    color: c.isDark ? '#F7F5FF' : '#171526',
    fontSize: 11,
    fontWeight: '700',
  },
})
