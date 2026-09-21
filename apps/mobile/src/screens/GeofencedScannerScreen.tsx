/**
 * GeofencedScannerScreen
 *
 * The second half of the dual-verification claim flow. The player has already
 * claimed a voucher (held, not yet redeemed); this screen gets them from
 * "I have a voucher" to "the barista handed me the coffee".
 *
 * Two gates, in order:
 *
 *   1. Geofence. A live GPS watch computes distance to the venue. The camera
 *      does not even mount until the player is inside claim_radius_m. This is
 *      purely a UX gate -- it stops people scanning a photo of the QR from
 *      across town and getting a confusing server error.
 *
 *   2. Counter code. The in-store display shows a QR that rotates every 30
 *      seconds. Scanning it proves physical presence at the till in a way GPS
 *      alone cannot, because GPS is spoofable with an off-the-shelf app and a
 *      Legendary voucher is worth spoofing for.
 *
 * Both gates are re-checked server-side in redeem_voucher(). Nothing here is
 * trusted. The client-side versions exist to give fast, legible feedback.
 */

import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, type Palette } from '../lib/theme'
import { supabase } from '../lib/supabase'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


type Props = {
  voucher: {
    id: string
    redemptionCode: string
    titleKa: string
    titleEn: string
    holdExpiresAt: string
  }
  venue: {
    id: string
    nameKa: string
    nameEn: string
    latitude: number
    longitude: number
    claimRadiusM: number
  }
  onRedeemed: (result: RedeemResult) => void
  onCancel: () => void
}

type RedeemResult = {
  redemptionId: string
  xpAwarded: number
}

type Phase =
  | { kind: 'locating' }
  | { kind: 'out_of_range'; distanceM: number }
  | { kind: 'ready'; distanceM: number }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string; retryable: boolean }

/** Metres between two WGS84 points. Mirrors PostGIS closely enough for UI. */
function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Server errors arrive as Postgres exception messages like "OUT_OF_RANGE:143".
 * Map them to localised copy rather than leaking raw strings to the player.
 */
function describeError(
  raw: string,
  t: (k: string, v?: Record<string, unknown>) => string,
): { message: string; retryable: boolean } {
  const [code, detail] = raw.split(':')
  switch (code) {
    case 'OUT_OF_RANGE':
      return { message: t('redeem.outOfRange', { metres: detail }), retryable: true }
    case 'BAD_COUNTER_CODE':
      return { message: t('redeem.badCounterCode'), retryable: true }
    case 'ALREADY_REDEEMED':
      return { message: t('redeem.alreadyRedeemed'), retryable: false }
    case 'HOLD_EXPIRED':
      return { message: t('redeem.holdExpired'), retryable: false }
    case 'NOT_YOUR_VOUCHER':
      return { message: t('redeem.notYours'), retryable: false }
    default:
      return { message: t('redeem.genericError'), retryable: true }
  }
}

export default function GeofencedScannerScreen({
  voucher,
  venue,
  onRedeemed,
  onCancel,
}: Props) {
  const styles = useStyles()
  const { t, locale } = useTranslation()
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<Phase>({ kind: 'locating' })
  const [fix, setFix] = useState<Location.LocationObject | null>(null)

  // Barcode callbacks fire many times per second while a code is in frame.
  // Without this guard a single scan would fire a dozen redeem calls.
  const submitting = useRef(false)

  const venueName = locale === 'ka' ? venue.nameKa : venue.nameEn
  const voucherTitle = locale === 'ka' ? voucher.titleKa : voucher.titleEn

  // -- Gate 1: live location watch -----------------------------------------
  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined
    let cancelled = false

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: t('redeem.locationDenied'),
            retryable: false,
          })
        }
        return
      }

      // Same seeding as the map: without it a stationary phone (or a static
      // mock location) can sit on "locating" indefinitely, because a watch
      // with a distanceInterval waits for movement.
      try {
        const seed =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }))
        if (seed && !cancelled) {
          applyPosition(seed)
        }
      } catch {
        // Fall through to the watch.
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 2,
          timeInterval: 1500,
        },
        applyPosition,
      )
    }

    function applyPosition(position: Location.LocationObject) {
      if (cancelled) return
      setFix(position)

      const distanceM = haversineMeters(
        position.coords.latitude,
        position.coords.longitude,
        venue.latitude,
        venue.longitude,
      )

      setPhase((prev) => {
        // Never yank the user out of a submit or a terminal error.
        if (prev.kind === 'submitting') return prev
        if (prev.kind === 'error' && !prev.retryable) return prev

        // Accuracy padding: a 30m-accurate fix 25m away might really be at
        // the door. Being strict here produces false rejections indoors,
        // and the counter QR is the real proof anyway.
        const padding = Math.min(position.coords.accuracy ?? 0, 30)
        const inRange = distanceM - padding <= venue.claimRadiusM

        return inRange
          ? { kind: 'ready', distanceM }
          : { kind: 'out_of_range', distanceM }
      })
    }

    void start()
    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [venue.latitude, venue.longitude, venue.claimRadiusM, t])

  // -- Gate 2: counter QR --------------------------------------------------
  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      if (submitting.current) return
      if (phase.kind !== 'ready') return
      if (!fix) return

      submitting.current = true
      setPhase({ kind: 'submitting' })
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      // Counter QRs encode "tq:<venueId>:<code>". Reject anything else early
      // so a random QR on a cereal box does not hit the API.
      const parts = data.split(':')
      if (parts.length !== 3 || parts[0] !== 'tq' || parts[1] !== venue.id) {
        submitting.current = false
        setPhase({
          kind: 'error',
          message: t('redeem.wrongVenueCode'),
          retryable: true,
        })
        return
      }

      const { data: result, error } = await supabase.rpc('redeem_voucher', {
        p_redemption_code: voucher.redemptionCode,
        p_counter_code: parts[2],
        p_lat: fix.coords.latitude,
        p_lng: fix.coords.longitude,
      })

      submitting.current = false

      if (error) {
        const { message, retryable } = describeError(error.message, t)
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setPhase({ kind: 'error', message, retryable })
        return
      }

      const row = Array.isArray(result) ? result[0] : result
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onRedeemed({ redemptionId: row.redemption_id, xpAwarded: row.xp_awarded })
    },
    [phase.kind, fix, venue.id, voucher.redemptionCode, onRedeemed, t],
  )

  // -- Camera permission ---------------------------------------------------
  if (!permission) {
    return <Centered><ActivityIndicator /></Centered>
  }

  if (!permission.granted) {
    return (
      <Centered>
        <Text style={styles.heading}>{t('redeem.cameraNeeded')}</Text>
        <Text style={styles.body}>{t('redeem.cameraWhy')}</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>{t('common.allow')}</Text>
        </Pressable>
      </Centered>
    )
  }

  const showCamera = phase.kind === 'ready' || phase.kind === 'submitting'

  return (
    <View style={styles.root}>
      {showCamera ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={phase.kind === 'ready' ? handleScan : undefined}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]} />
      )}

      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.venue}>{venueName}</Text>
          <Text style={styles.voucher}>{voucherTitle}</Text>
        </View>

        {showCamera && (
          <View style={styles.reticle}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        )}

        <View style={styles.footer}>
          <StatusPanel phase={phase} t={t} />
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function StatusPanel({
  phase,
  t,
}: {
  phase: Phase
  t: (k: string, v?: Record<string, unknown>) => string
}) {
  const styles = useStyles()
  switch (phase.kind) {
    case 'locating':
      return (
        <Panel tone="neutral">
          <ActivityIndicator color="#fff" />
          <Text style={styles.panelText}>{t('redeem.locating')}</Text>
        </Panel>
      )

    case 'out_of_range': {
      const metres = Math.round(phase.distanceM)
      return (
        <Panel tone="warn">
          <Text style={styles.panelTitle}>{t('redeem.getCloser')}</Text>
          <Text style={styles.panelText}>
            {metres > 1000
              ? t('redeem.distanceKm', { km: (metres / 1000).toFixed(1) })
              : t('redeem.distanceM', { metres })}
          </Text>
        </Panel>
      )
    }

    case 'ready':
      return (
        <Panel tone="good">
          <Text style={styles.panelTitle}>{t('redeem.scanCounterCode')}</Text>
          <Text style={styles.panelText}>{t('redeem.pointAtDisplay')}</Text>
        </Panel>
      )

    case 'submitting':
      return (
        <Panel tone="neutral">
          <ActivityIndicator color="#fff" />
          <Text style={styles.panelText}>{t('redeem.verifying')}</Text>
        </Panel>
      )

    case 'error':
      return (
        <Panel tone="bad">
          <Text style={styles.panelTitle}>{phase.message}</Text>
          {phase.retryable && (
            <Text style={styles.panelText}>{t('redeem.tryAgain')}</Text>
          )}
        </Panel>
      )
  }
}

function Panel({
  tone,
  children,
}: {
  tone: 'neutral' | 'good' | 'warn' | 'bad'
  children: React.ReactNode
}) {
  const styles = useStyles()
  return <View style={[styles.panel, styles[tone]]}>{children}</View>
}

function Centered({ children }: { children: React.ReactNode }) {
  const styles = useStyles()
  return <View style={[styles.root, styles.centered]}>{children}</View>
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  cameraPlaceholder: { backgroundColor: c.bg },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 20 },

  header: { marginTop: 48, gap: 4 },
  venue: { color: c.accentInk, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  voucher: { color: c.text, fontSize: 24, fontWeight: '700' },

  reticle: { alignSelf: 'center', width: 240, height: 240 },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: c.accent },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },

  footer: { gap: 12, marginBottom: 24 },
  panel: {
    borderRadius: 14,
    padding: 16,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  neutral: { backgroundColor: c.surface },
  good: { backgroundColor: 'rgba(38,92,58,0.94)' },
  warn: { backgroundColor: 'rgba(120,84,20,0.94)' },
  bad: { backgroundColor: 'rgba(122,38,38,0.94)' },
  panelTitle: { color: c.text, fontSize: 16, fontWeight: '700', width: '100%' },
  panelText: { color: c.textMuted, fontSize: 14 },

  heading: { color: c.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { color: c.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },

  primaryButton: {
    backgroundColor: c.accent,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryButtonText: { color: c.bg, fontWeight: '700', fontSize: 16 },

  cancelButton: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: c.textMuted, fontSize: 15 },
})
