import { StyleSheet, Text, View } from 'react-native'

import { useTranslation } from '../lib/i18n'
import { colors, radius, space } from '../lib/theme'
import type { SafetyState } from '../lib/useSafetyGate'
import EmergencyButton from './EmergencyButton'

/**
 * Covers the map whenever play is blocked.
 *
 * Deliberately opaque rather than a dismissible banner: if the player is in a
 * moving car, the map being *visible* is the problem. There is no "continue
 * anyway" — an override would be used exactly by the people it is meant to
 * protect.
 *
 * The 112 button stays reachable underneath, because the moment someone most
 * needs emergency services is the moment they are moving fast.
 */
export default function SafetyOverlay({ safety }: { safety: SafetyState }) {
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  if (!safety.blocked) return null

  const speed = safety.speedKmh != null ? Math.round(safety.speedKmh) : null

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        {safety.speedLocked ? (
          <>
            <Text style={styles.icon}>⛔</Text>
            <Text style={styles.title}>
              {ka ? 'ძალიან სწრაფად მოძრაობ' : 'You are moving too fast'}
            </Text>
            <Text style={styles.body}>
              {ka
                ? 'თამაში ხელმისაწვდომია მხოლოდ ფეხით სიარულისას. თუ მანქანაში ხარ, გადაეცი ტელეფონი მგზავრს.'
                : 'The game only works at walking pace. If you are in a car, hand the phone to a passenger.'}
            </Text>
            {speed != null && (
              <Text style={styles.detail}>
                {ka ? `დაახლოებით ${speed} კმ/სთ` : `About ${speed} km/h`}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.icon}>🌙</Text>
            <Text style={styles.title}>
              {ka ? 'დღეს დახურულია' : 'Closed for today'}
            </Text>
            <Text style={styles.body}>
              {ka
                ? `თამაში მუშაობს ${safety.config.playOpensAt}-დან ${safety.config.playClosesAt}-მდე, დღის სინათლეზე.`
                : `Hunting runs from ${safety.config.playOpensAt} to ${safety.config.playClosesAt}, in daylight only.`}
            </Text>
            {safety.opensInMinutes != null && (
              <Text style={styles.detail}>
                {ka
                  ? `იხსნება ${formatWait(safety.opensInMinutes, true)}`
                  : `Opens in ${formatWait(safety.opensInMinutes, false)}`}
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.emergency}>
        <EmergencyButton />
      </View>
    </View>
  )
}

function formatWait(minutes: number, ka: boolean): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return ka ? `${m} წუთში` : `${m} min`
  return ka ? `${h} სთ ${m} წთ-ში` : `${h}h ${m}m`
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(18,16,28,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: { alignItems: 'center', gap: space.md, maxWidth: 340 },
  icon: { fontSize: 48 },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  detail: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginTop: space.xs,
  },
  emergency: {
    position: 'absolute',
    bottom: space.xxl,
    left: space.xl,
    right: space.xl,
  },
})
