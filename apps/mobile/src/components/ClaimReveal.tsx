import * as Haptics from 'expo-haptics'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { useTranslation } from '../lib/i18n'
import {
  ShareCardCanvas,
  shareCard,
  useReferralCode,
} from './ShareCard'
import {
  useTheme,
  useRarity,
  radius,
  space,
  font,
  type Palette,
  type Rarity,
} from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

/**
 * The moment a claim actually happens.
 *
 * Before this, claiming was a success haptic and an instant jump to the
 * vouchers list -- correct, and completely forgettable. The reward is the same
 * either way; what people remember, talk about and screenshot is the two
 * seconds around it. Rarity drives the length and the violence of the
 * animation, so a Legendary feels different in the hand rather than only
 * carrying a different word.
 *
 * Deliberately not skippable for its first 900 ms and then dismissible by a
 * tap anywhere: a player collecting their fifth voucher of the day should not
 * be held hostage by the fireworks.
 */
export type ClaimedDrop = {
  rarity: Rarity
  titleKa: string | null
  titleEn: string | null
  venueKa: string | null
  venueEn: string | null
  /** The number that makes someone stop scrolling: "-30%", "1+1", "FREE". */
  headline: string | null
}

type Phase = 'charge' | 'burst' | 'card'

/** Particles in the burst. A Legendary throws noticeably more of them. */
const PARTICLES: Record<Rarity, number> = {
  common: 10,
  rare: 16,
  legendary: 26,
}

/** How long the crate shakes before it opens. */
const CHARGE_MS: Record<Rarity, number> = {
  common: 450,
  rare: 700,
  legendary: 1100,
}

export default function ClaimReveal({
  drop,
  onDone,
}: {
  drop: ClaimedDrop
  onDone: () => void
}) {
  const styles = useStyles()
  const { c } = useTheme()
  const rarity = useRarity()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const meta = rarity[drop.rarity] ?? rarity.common
  const [phase, setPhase] = useState<Phase>('charge')
  const cardRef = useRef<View>(null)
  const referralCode = useReferralCode()
  const [sharing, setSharing] = useState(false)
  const [dismissable, setDismissable] = useState(false)

  const crateScale = useSharedValue(0.2)
  const crateShake = useSharedValue(0)
  const crateOpacity = useSharedValue(1)
  const ringScale = useSharedValue(0.1)
  const ringOpacity = useSharedValue(0)
  const cardY = useSharedValue(120)
  const cardOpacity = useSharedValue(0)

  useEffect(() => {
    const charge = CHARGE_MS[drop.rarity]
    const timers: ReturnType<typeof setTimeout>[] = []

    // 1. The crate lands and starts rattling. Each rattle carries a haptic
    //    tick, getting heavier as it goes -- the anticipation is doing more
    //    work here than the payoff.
    crateScale.value = withSpring(1, { damping: 9, stiffness: 160 })
    crateShake.value = withDelay(
      160,
      withRepeat(
        withSequence(
          withTiming(-1, { duration: 55 }),
          withTiming(1, { duration: 55 }),
        ),
        Math.max(2, Math.round(charge / 110)),
        true,
      ),
    )

    const ticks = drop.rarity === 'legendary' ? 5 : drop.rarity === 'rare' ? 3 : 2
    for (let i = 0; i < ticks; i += 1) {
      timers.push(
        setTimeout(
          () => {
            void Haptics.impactAsync(
              i === ticks - 1
                ? Haptics.ImpactFeedbackStyle.Heavy
                : i > ticks / 2
                  ? Haptics.ImpactFeedbackStyle.Medium
                  : Haptics.ImpactFeedbackStyle.Light,
            )
          },
          200 + (i * charge) / ticks,
        ),
      )
    }

    // 2. It blows open: the crate punches out of frame while a ring of light
    //    expands past the edges of the screen.
    timers.push(
      setTimeout(() => {
        setPhase('burst')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        crateScale.value = withSequence(
          withTiming(1.35, { duration: 110, easing: Easing.out(Easing.quad) }),
          withTiming(0.4, { duration: 220, easing: Easing.in(Easing.quad) }),
        )
        crateOpacity.value = withDelay(110, withTiming(0, { duration: 200 }))
        ringOpacity.value = withSequence(
          withTiming(0.9, { duration: 90 }),
          withTiming(0, { duration: 420 }),
        )
        ringScale.value = withTiming(3.4, {
          duration: 520,
          easing: Easing.out(Easing.cubic),
        })
      }, charge + 220),
    )

    // 3. The prize card springs in and stays.
    timers.push(
      setTimeout(() => {
        setPhase('card')
        cardOpacity.value = withTiming(1, { duration: 220 })
        cardY.value = withSpring(0, { damping: 14, stiffness: 140 })
      }, charge + 460),
    )

    timers.push(setTimeout(() => setDismissable(true), charge + 900))

    return () => timers.forEach(clearTimeout)
  }, [
    drop.rarity,
    crateScale,
    crateShake,
    crateOpacity,
    ringScale,
    ringOpacity,
    cardY,
    cardOpacity,
  ])

  const crateStyle = useAnimatedStyle(() => ({
    opacity: crateOpacity.value,
    transform: [
      { scale: crateScale.value },
      { rotate: `${crateShake.value * 5}deg` },
      { translateX: crateShake.value * 6 },
    ],
  }))

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }))

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }))

  const title = (ka ? drop.titleKa : drop.titleEn) ?? ''
  const venue = (ka ? drop.venueKa : drop.venueEn) ?? ''

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <Pressable
        style={styles.backdrop}
        onPress={dismissable ? onDone : undefined}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { borderColor: meta.color, shadowColor: meta.color },
            ringStyle,
          ]}
        />

        {phase !== 'charge' &&
          Array.from({ length: PARTICLES[drop.rarity] }).map((_, i) => (
            <Particle
              key={i}
              index={i}
              total={PARTICLES[drop.rarity]}
              color={meta.color}
            />
          ))}

        <Animated.View style={[styles.crate, crateStyle]}>
          <View
            style={[
              styles.crateInner,
              { borderColor: meta.color, shadowColor: meta.glow },
            ]}
          >
            <Image
              source={require('../../assets/store-icon-192.png')}
              style={styles.crateIcon}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {phase === 'card' && (
          <Animated.View style={[styles.card, cardStyle]}>
            <Text style={[styles.rarityLabel, { color: meta.color }]}>
              {meta.label[ka ? 'ka' : 'en']}
            </Text>
            <Text style={styles.title}>{title}</Text>
            {venue !== '' && <Text style={styles.venue}>{venue}</Text>}

            <View style={[styles.rule, { backgroundColor: meta.color }]} />

            <Text style={styles.hint}>
              {ka
                ? 'ვაუჩერი შენია - გამოსაყენებლად დაასკანერე კოდი სალაროსთან'
                : "It's yours - scan the code at the counter to use it"}
            </Text>

            <Pressable
              style={[styles.button, { backgroundColor: meta.color }]}
              onPress={onDone}
            >
              <Text style={styles.buttonText}>
                {ka ? 'ჩემი ვაუჩერები' : 'My vouchers'}
              </Text>
            </Pressable>

            {/* Offered at the moment someone is most pleased with themselves,
                which is the only moment anyone shares anything. */}
            <Pressable
              style={[styles.secondary, sharing && styles.secondaryBusy]}
              disabled={sharing}
              onPress={async () => {
                setSharing(true)
                try {
                  await shareCard(cardRef)
                } finally {
                  setSharing(false)
                }
              }}
            >
              <Text style={styles.secondaryText}>
                {sharing
                  ? ka ? 'მზადდება…' : 'Preparing…'
                  : ka ? 'გაზიარება' : 'Share this'}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        <ShareCardCanvas
          ref={cardRef}
          code={referralCode}
          data={{
            rarity: drop.rarity,
            title,
            venue,
            headline: drop.headline,
          }}
        />

        {!dismissable && <View style={styles.tapBlocker} pointerEvents="none" />}
        {dismissable && phase === 'card' && (
          <Text style={[styles.dismiss, { color: c.textFaint }]}>
            {ka ? 'შეეხე დასახურად' : 'Tap anywhere to close'}
          </Text>
        )}
      </Pressable>
    </Modal>
  )
}

/**
 * One spark. Each flies along its own angle with a slightly different distance
 * and duration, because a perfectly even starburst reads as a loading spinner.
 */
function Particle({
  index,
  total,
  color,
}: {
  index: number
  total: number
  color: string
}) {
  const progress = useSharedValue(0)
  const angle = (index / total) * Math.PI * 2
  const distance = 120 + ((index * 37) % 90)
  const size = 5 + ((index * 13) % 7)

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 480 + ((index * 53) % 260),
      easing: Easing.out(Easing.cubic),
    })
  }, [index, progress])

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value },
      { scale: 1 - progress.value * 0.6 },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,3,9,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    shadowOpacity: 0.9,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  crate: { position: 'absolute' },
  crateInner: {
    width: 156,
    height: 156,
    borderRadius: radius.xl,
    borderWidth: 2,
    backgroundColor: c.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  crateIcon: { width: 112, height: 112 },
  card: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  rarityLabel: {
    fontSize: font.eyebrow.fontSize,
    fontWeight: font.eyebrow.fontWeight,
    letterSpacing: font.eyebrow.letterSpacing,
    textTransform: 'uppercase',
  },
  title: {
    color: c.text,
    fontSize: font.title.fontSize,
    fontWeight: font.title.fontWeight,
    letterSpacing: font.title.letterSpacing,
    textAlign: 'center',
  },
  venue: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
  rule: { width: 48, height: 3, borderRadius: 2, marginVertical: space.sm },
  hint: {
    color: c.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  button: {
    marginTop: space.lg,
    alignSelf: 'stretch',
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  buttonText: { color: '#08060F', fontSize: 16, fontWeight: '800' },
  secondary: {
    marginTop: space.sm,
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  secondaryBusy: { opacity: 0.6 },
  secondaryText: { color: c.text, fontSize: 15, fontWeight: '700' },
  tapBlocker: { ...StyleSheet.absoluteFill },
  dismiss: { position: 'absolute', bottom: space.xxl, fontSize: 12 },
})
