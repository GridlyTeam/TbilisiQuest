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
import { useLocation } from '../../lib/useLocation'
import ClaimReveal, { type ClaimedDrop } from '../../components/ClaimReveal'
import {
  useTheme,
  useRarity,
  radius,
  space,
  font,
  type Palette,
  type Rarity,
} from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


type DropDetail = {
  id: string
  rarity: Rarity
  starts_at: string
  ends_at: string
  claim_radius_m: number
  reveal_radius_m: number
  distance_m: number
  remaining: number
  in_claim_range: boolean
  own_voucher: 'none' | 'held' | 'redeemed' | string
  venue_name_ka: string | null
  venue_name_en: string | null
  title_ka: string | null
  title_en: string | null
  description_ka: string | null
  description_en: string | null
  squad_size: number
  squad_present: number
  squad_ready: boolean
  squad_allowed: boolean
  offer: 'percent_off' | 'bogo' | 'free_item' | null
  discount_percent: number | null
}


function useCountdown(target: string | undefined, ka = false) {
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
  // Georgian gets Georgian units: an otherwise Georgian screen reading
  // "2h 15m" is the kind of seam that makes an app feel translated rather
  // than written.
  if (h > 0) return ka ? `${h} სთ ${m} წთ` : `${h}h ${m}m`
  return `${m}:${String(s).padStart(2, '0')}`
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
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fixTimedOut, setFixTimedOut] = useState(false)
  const [claimed, setClaimed] = useState<ClaimedDrop | null>(null)
  const [claimedVoucherId, setClaimedVoucherId] = useState<string | null>(null)

  // This screen starts its own location watch, so there is a gap before the
  // first fix. Say what is happening instead of spinning indefinitely.
  useEffect(() => {
    if (fix) {
      setFixTimedOut(false)
      return
    }
    const timer = setTimeout(() => setFixTimedOut(true), 10000)
    return () => clearTimeout(timer)
  }, [fix])

  const ka = locale === 'ka'

  const load = useCallback(async () => {
    if (!id || !fix) return
    const { data, error } = await supabase.rpc('drop_detail', {
      p_drop_id: id,
      p_lat: fix.latitude,
      p_lng: fix.longitude,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    const row = Array.isArray(data) ? data[0] : data
    setDrop((row as DropDetail) ?? null)
  }, [id, fix])

  useEffect(() => {
    void load()
  }, [load])

  // Presence is a heartbeat, not a one-off: a check-in goes stale after four
  // minutes, so standing at a squad drop waiting for friends has to keep
  // renewing it or the squad silently falls apart while everyone is present.
  const isSquad = (drop?.squad_size ?? 1) > 1
  useEffect(() => {
    if (!isSquad || !drop?.in_claim_range || !fix || !drop.squad_allowed) return

    let cancelled = false
    async function beat() {
      const { data } = await supabase.rpc('squad_checkin', {
        p_drop_id: id,
        p_lat: fix!.latitude,
        p_lng: fix!.longitude,
      })
      const row = Array.isArray(data) ? data[0] : data
      if (cancelled || !row) return
      setDrop((prev) =>
        prev
          ? {
              ...prev,
              squad_present: row.present as number,
              squad_ready: row.ready as boolean,
            }
          : prev,
      )
    }

    void beat()
    const timer = setInterval(beat, 20_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isSquad, drop?.in_claim_range, drop?.squad_allowed, fix, id])

  const distance = drop?.distance_m ?? null
  const inRange = drop?.in_claim_range ?? false
  const opensIn = useCountdown(drop?.starts_at, ka)
  const endsIn = useCountdown(drop?.ends_at, ka)
  const notYetOpen = opensIn != null

  async function claim() {
    if (!drop || !fix) return
    setClaiming(true)
    setError(null)

    const { data, error } = await supabase.rpc('claim_voucher', {
      p_drop_id: drop.id,
      p_lat: fix.latitude,
      p_lng: fix.longitude,
    })

    setClaiming(false)

    if (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      // The raw message is appended while the app is in testing: a translated
      // "Something went wrong" is useless to whoever has to fix it, and every
      // unrecognised code so far has cost a round trip to find out what it was.
      setError(translateClaimError(error.message, ka))
      console.warn('[claim] failed', error.message, error.code, error.details)
      void load()
      return
    }

    // The success haptic now belongs to the reveal, which plays its own
    // escalating sequence. Navigation waits until the player dismisses it.
    const row = Array.isArray(data) ? data[0] : data
    setClaimedVoucherId((row?.voucher_id as string) ?? null)
    setClaimed({
      rarity: drop.rarity,
      titleKa: drop.title_ka,
      titleEn: drop.title_en,
      venueKa: drop.venue_name_ka,
      venueEn: drop.venue_name_en,
      headline: offerHeadline(drop.offer, drop.discount_percent, ka),
    })
  }

  if (!fix) {
    return (
      <View style={styles.centered}>
        {fixTimedOut ? (
          <>
            <Text style={styles.title}>
              {ka ? 'ლოკაცია მიუწვდომელია' : 'No location yet'}
            </Text>
            <Text style={styles.hint}>
              {ka
                ? 'ჩართე GPS და გამოდი ღია ცის ქვეშ.'
                : 'Turn on GPS and step outside - the drop needs your position to measure distance.'}
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator color={c.accent} />
            <Text style={styles.hint}>
              {ka ? 'მდებარეობის დადგენა…' : 'Finding your location…'}
            </Text>
          </>
        )}
      </View>
    )
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
  const title = (ka ? drop.title_ka : drop.title_en) ?? ''
  const description = ka ? drop.description_ka : drop.description_en
  const venueName = ka ? drop.venue_name_ka : drop.venue_name_en
  const soldOut = drop.remaining === 0
  const alreadyHeld = drop.own_voucher === 'held'
  const alreadyRedeemed = drop.own_voucher === 'redeemed'
  const owned = alreadyHeld || alreadyRedeemed
  const squadBlocked = isSquad && (!drop.squad_allowed || !drop.squad_ready)
  const blocked =
    owned || !inRange || soldOut || notYetOpen || claiming || squadBlocked

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.pillRow}>
        <View style={[styles.rarityPill, { backgroundColor: meta.glow, borderColor: meta.color }]}>
          <Text style={[styles.rarityText, { color: meta.color }]}>
            {meta.label[ka ? 'ka' : 'en'].toUpperCase()}
          </Text>
        </View>

        {/* A glowing dot for a drop that is open right now. Taken from the
            dashboard design, where it is the one thing on the page that says
            "go now" rather than "some time". */}
        {!notYetOpen && !soldOut && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{ka ? 'აქტიური' : 'LIVE'}</Text>
          </View>
        )}
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.venue}>{venueName}</Text>
      {description && <Text style={styles.description}>{description}</Text>}

      <View style={styles.statRow}>
        <Stat
          label={ka ? 'დარჩა' : 'Left'}
          value={String(drop.remaining)}
          tone={soldOut ? 'bad' : 'good'}
        />
        <Stat
          label={ka ? 'მანძილი' : 'Distance'}
          value={
            distance == null
              ? '—'
              : distance > 1000
                ? `${(distance / 1000).toFixed(1)} ${ka ? 'კმ' : 'km'}`
                : `${Math.round(distance)} ${ka ? 'მ' : 'm'}`
          }
          tone={inRange ? 'good' : 'neutral'}
        />
        <Stat
          label={notYetOpen ? (ka ? 'იხსნება' : 'Opens in') : ka ? 'სრულდება' : 'Ends in'}
          value={notYetOpen ? (opensIn ?? '—') : (endsIn ?? '—')}
          tone="neutral"
        />
      </View>

      {isSquad && (
        <View style={[styles.squad, { borderColor: meta.color }]}>
          <Text style={styles.squadLabel}>
            {ka ? 'ჯგუფური დროფი' : 'Squad drop'}
          </Text>

          {!drop.squad_allowed ? (
            <Text style={styles.squadBody}>
              {ka
                ? 'ჯგუფური დროფები 16 წლიდანაა.'
                : 'Squad drops are for ages 16 and up.'}
            </Text>
          ) : (
            <>
              <Text style={[styles.squadCount, { color: meta.color }]}>
                {drop.squad_present} / {drop.squad_size}
              </Text>
              <Text style={styles.squadBody}>
                {drop.squad_ready
                  ? ka
                    ? 'ჯგუფი შეიკრიბა - აიღეთ ვაუჩერები!'
                    : 'Squad complete — grab your vouchers!'
                  : !inRange
                    ? ka
                      ? `საჭიროა ${drop.squad_size} ადამიანი ერთდროულად ადგილზე`
                      : `Needs ${drop.squad_size} people at the venue at once`
                    : ka
                      ? 'დაელოდე მეგობრებს - ყველამ უნდა მოაღწიოს ადგილზე'
                      : 'Waiting for friends — everyone has to be here'}
              </Text>
            </>
          )}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[
          styles.claimButton,
          { backgroundColor: meta.color },
          blocked && styles.claimDisabled,
        ]}
        onPress={claim}
        disabled={blocked}
      >
        {claiming ? (
          <ActivityIndicator color="#08060F" />
        ) : (
          <Text style={[styles.claimText, blocked && styles.claimTextDisabled]}>
            {alreadyRedeemed
              ? ka
                ? 'უკვე გამოყენებულია'
                : 'Already redeemed'
              : alreadyHeld
                ? ka
                  ? 'ვაუჩერი აღებულია'
                  : 'In your vouchers'
                : soldOut
              ? ka
                ? 'ამოიწურა'
                : 'Sold out'
              : notYetOpen
                ? ka
                  ? 'ჯერ არ დაწყებულა'
                  : 'Not open yet'
                : !inRange
                  ? ka
                    ? 'მიუახლოვდი'
                    : 'Get closer to claim'
                  : squadBlocked
                    ? !drop.squad_allowed
                      ? ka
                        ? '16 წლიდან'
                        : 'Ages 16+'
                      : ka
                        ? `საჭიროა კიდევ ${drop.squad_size - drop.squad_present}`
                        : `Waiting for ${drop.squad_size - drop.squad_present} more`
                    : ka
                      ? 'აიღე ვაუჩერი'
                      : 'Claim voucher'}
          </Text>
        )}
      </Pressable>

      {!inRange && !soldOut && !owned && distance != null && (
        <Text style={styles.hint}>
          {ka
            ? `უნდა იყო ${drop.claim_radius_m} მეტრში`
            : `You need to be within ${drop.claim_radius_m} m`}
        </Text>
      )}

      {claimed && (
        <ClaimReveal
          drop={claimed}
          onScan={
            claimedVoucherId
              ? () =>
                  // Typed routes cannot know a dynamic segment built at
                  // runtime; the route file exists at app/scan/[id].tsx.
                  router.replace({
                    pathname: '/scan/[id]',
                    params: { id: claimedVoucherId },
                  })
              : undefined
          }
          onDone={() => router.replace('/vouchers')}
        />
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

/**
 * The one line on the share card. Kept to a few characters on purpose: it is
 * read at arm's length from someone else's story, not studied.
 */
function offerHeadline(
  offer: DropDetail['offer'],
  percent: number | null,
  ka: boolean,
): string | null {
  if (offer === 'percent_off' && percent) return `-${percent}%`
  if (offer === 'bogo') return '1+1'
  if (offer === 'free_item') return ka ? 'უფასოდ' : 'FREE'
  return null
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
    case 'AGE_NOT_SET':
      return ka
        ? 'ჯერ მიუთითე დაბადების თარიღი'
        : 'Tell us your date of birth first'
    case 'AGE_RESTRICTED':
      return ka ? 'ჯგუფური დროფები 16 წლიდანაა' : 'Squad drops are for ages 16+'
    case 'SQUAD_NOT_READY':
      return ka ? 'ჯგუფი ჯერ არ შეკრებილა' : 'Not enough of you here yet'
    case 'OVER_PER_DROP_LIMIT':
    case 'OVER_MONTHLY_ALLOWANCE':
      return ka ? 'ლიმიტი ამოწურულია' : 'Venue allowance reached'
    default:
      // Deliberately shows the raw code. "Something went wrong" tells the
      // player nothing and tells whoever has to fix it even less; every
      // unrecognised code so far has cost a round trip to identify.
      return ka
        ? `რაღაც ვერ გამოვიდა (${raw})`
        : `Something went wrong (${raw})`
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
    padding: space.xl,
    gap: space.md,
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.good,
    shadowColor: c.good,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  liveText: {
    color: c.good,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  rarityPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  rarityText: { fontSize: 11, fontWeight: '900', letterSpacing: 0 },
  title: {
    color: c.text,
    fontSize: font.title.fontSize,
    fontWeight: font.title.fontWeight,
    letterSpacing: 0,
  },
  venue: {
    color: c.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
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
  statLabel: {
    color: c.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  statValue: { fontSize: 21, fontWeight: '900', letterSpacing: 0, marginTop: 3 },
  squad: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.lg,
    marginTop: space.md,
    gap: 2,
  },
  squadLabel: {
    color: c.textFaint,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  squadCount: { fontSize: 32, fontWeight: '900', letterSpacing: 0 },
  squadBody: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  claimButton: {
    backgroundColor: c.accent,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    marginTop: space.lg,
  },
  claimDisabled: {
    backgroundColor: c.surfaceRaised,
    borderWidth: 1,
    borderColor: c.border,
  },
  claimText: {
    color: '#08060F',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  claimTextDisabled: { color: c.text },
  hint: { color: c.text, fontSize: 13, textAlign: 'center', fontWeight: '600' },
  error: { color: c.bad, fontSize: 14 },
  muted: { color: c.textMuted },
})
