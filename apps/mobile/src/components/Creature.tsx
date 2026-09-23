import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { useTheme } from '../lib/theme'

/**
 * The player's creature.
 *
 * Drawn from Views while the generated art is commissioned. The shapes here are
 * a stand-in; the motion is not -- floating, breathing, squashing and blinking
 * are all code, they cost nothing per player, and they carry over unchanged
 * when the body becomes an Image. That is the whole reason the app never needed
 * a 3D engine: one still picture plus this file reads as alive.
 *
 * The eyes are drawn rather than baked into the body on purpose. Blinking,
 * glancing and squinting are then free and infinite, where a rendered face
 * needs one more picture per expression per colour.
 */

export const CREATURE_COLOURS: Record<string, { body: string; shade: string }> = {
  red: { body: '#FF6B84', shade: '#E24C67' },
  orange: { body: '#FF9A4D', shade: '#E07A2E' },
  amber: { body: '#FFC24D', shade: '#E0A02E' },
  green: { body: '#5BE09A', shade: '#39BE79' },
  cyan: { body: '#5BD8FF', shade: '#33B6E0' },
  blue: { body: '#7BA3FF', shade: '#5A80E0' },
  violet: { body: '#B87CFF', shade: '#9557E0' },
  pink: { body: '#FF8ED8', shade: '#E06BB6' },
}

export const DEFAULT_COLOUR = 'cyan'

/** The band an outfit paints across the body, until outfits are pictures. */
const OUTFIT_TRIM: Record<string, string> = {
  hoodie_fab: '#2B2340',
  track_sab: '#14324A',
  denim_vake: '#243B63',
  coat_rust: '#8A4B22',
  jacket_dry: '#2F3B2A',
  wind_marj: '#5B2D63',
}

export default function Creature({
  colour,
  outfit,
  size = 180,
  animate = true,
}: {
  colour?: string | null
  outfit?: string | null
  size?: number
  animate?: boolean
}) {
  const { c } = useTheme()
  const styles = makeStyles()

  const skin = CREATURE_COLOURS[colour ?? ''] ?? CREATURE_COLOURS[DEFAULT_COLOUR]
  const trim = OUTFIT_TRIM[outfit ?? '']

  // Three loops, deliberately out of step with each other: a body that bobs
  // and breathes on the same beat reads as a mechanism.
  const bob = useSharedValue(0)
  const breath = useSharedValue(0)
  const blink = useSharedValue(1)

  useEffect(() => {
    if (!animate) return

    bob.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    breath.value = withDelay(
      400,
      withRepeat(
        withTiming(1, { duration: 3100, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    )
    // Closed for a twelfth of a second, open for four -- roughly how often a
    // person blinks, which is what makes it read as a living thing rather
    // than a timer.
    blink.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000 }),
        withTiming(0.05, { duration: 70 }),
        withTiming(1, { duration: 90 }),
      ),
      -1,
      false,
    )
  }, [animate, bob, breath, blink])

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -bob.value * size * 0.05 },
      // Squash on the way down, stretch on the way up, conserving volume --
      // the difference between something floating and something sliding.
      { scaleX: 1 + (1 - bob.value) * 0.03 + breath.value * 0.012 },
      { scaleY: 1 - (1 - bob.value) * 0.03 + breath.value * 0.018 },
    ],
  }))

  // The shadow does as much work as the body: without it the creature reads as
  // pasted onto the screen rather than hovering above something.
  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - bob.value * 0.22 }],
    opacity: 0.28 - bob.value * 0.12,
  }))

  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }))

  const w = size * 0.72
  const h = size * 0.68
  const eye = size * 0.13
  const legW = size * 0.15
  const legH = size * 0.15

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.shadow,
          { width: w * 0.8, height: size * 0.06, backgroundColor: '#000' },
          shadowStyle,
        ]}
      />

      <Animated.View style={[styles.stack, bodyStyle]}>
        {/* Legs go under the body so the body's curve overlaps them. */}
        <View style={[styles.legs, { width: w * 0.62, bottom: 0 }]}>
          <View
            style={{
              width: legW,
              height: legH,
              borderBottomLeftRadius: legW,
              borderBottomRightRadius: legW,
              backgroundColor: skin.shade,
            }}
          />
          <View
            style={{
              width: legW,
              height: legH,
              borderBottomLeftRadius: legW,
              borderBottomRightRadius: legW,
              backgroundColor: skin.shade,
            }}
          />
        </View>

        <View
          style={{
            width: w,
            height: h,
            marginBottom: legH * 0.72,
            borderRadius: size * 0.24,
            backgroundColor: skin.body,
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          {/* The outfit, for now, is the band across the chest. */}
          {trim && (
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                width: '100%',
                height: h * 0.42,
                backgroundColor: trim,
              }}
            />
          )}

          <View style={[styles.face, { marginTop: h * 0.24, gap: eye * 0.9 }]}>
            {[0, 1].map((i) => (
              <Animated.View
                key={i}
                style={[
                  {
                    width: eye,
                    height: eye * 1.25,
                    borderRadius: eye,
                    backgroundColor: '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  lidStyle,
                ]}
              >
                <View
                  style={{
                    width: eye * 0.5,
                    height: eye * 0.62,
                    borderRadius: eye,
                    backgroundColor: '#14101F',
                  }}
                />
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Arms last, so they sit over the body's edge. */}
        <View style={[styles.arms, { width: w + size * 0.16, bottom: legH * 1.3 }]}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                width: size * 0.12,
                height: size * 0.2,
                borderRadius: size * 0.08,
                backgroundColor: skin.shade,
              }}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  )
}

const makeStyles = () =>
  StyleSheet.create({
    root: { alignItems: 'center', justifyContent: 'flex-end' },
    stack: { alignItems: 'center', justifyContent: 'flex-end', flex: 1 },
    shadow: { position: 'absolute', bottom: 2, borderRadius: 999 },
    legs: {
      position: 'absolute',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    arms: {
      position: 'absolute',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    face: { flexDirection: 'row' },
  })
