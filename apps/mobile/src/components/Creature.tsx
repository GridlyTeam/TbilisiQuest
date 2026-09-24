import { useEffect } from 'react'
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

/**
 * The player's creature.
 *
 * One render, eight colours. The body was generated once in green and the rest
 * of the palette derived from it by rotating hue while keeping every pixel's
 * lightness and saturation -- which a single-hue matte character allows, and
 * which is why the whole set cost one generation rather than eight. The
 * recolouring script lives in the commit that added these files.
 *
 * The motion is code, as it always was: floating, squashing and breathing on
 * three loops deliberately out of step, because when they share a beat the
 * whole thing reads as a mechanism. That is the reason this app never needed a
 * 3D engine -- a still picture plus this file is a character that looks alive.
 */

const BODIES: Record<string, ImageSourcePropType> = {
  red: require('../../assets/creature/creature-red.png'),
  orange: require('../../assets/creature/creature-orange.png'),
  amber: require('../../assets/creature/creature-amber.png'),
  green: require('../../assets/creature/creature-green.png'),
  cyan: require('../../assets/creature/creature-cyan.png'),
  blue: require('../../assets/creature/creature-blue.png'),
  violet: require('../../assets/creature/creature-violet.png'),
  pink: require('../../assets/creature/creature-pink.png'),
}

/** The swatch colours, kept in step with the renders they stand for. */
export const CREATURE_COLOURS: Record<string, { body: string; shade: string }> = {
  red: { body: '#E85A5A', shade: '#C04444' },
  orange: { body: '#E8944A', shade: '#C0733A' },
  amber: { body: '#E8C04A', shade: '#C09A3A' },
  green: { body: '#9ED44A', shade: '#7FAE3A' },
  cyan: { body: '#4AC8D4', shade: '#3AA3AE' },
  blue: { body: '#5A8CE8', shade: '#4470C0' },
  violet: { body: '#9B6BE8', shade: '#7B52C0' },
  pink: { body: '#E85AB8', shade: '#C04496' },
}

export const DEFAULT_COLOUR = 'cyan'

/** The image is 308x407, and everything positioned around it assumes that. */
const RATIO = 407 / 308

export function creatureSource(colour?: string | null): ImageSourcePropType {
  return BODIES[colour ?? ''] ?? BODIES[DEFAULT_COLOUR]
}

export default function Creature({
  colour,
  size = 180,
  animate = true,
}: {
  colour?: string | null
  size?: number
  animate?: boolean
}) {
  const styles = makeStyles()

  const bob = useSharedValue(0)
  const breath = useSharedValue(0)

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
  }, [animate, bob, breath])

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -bob.value * size * 0.045 },
      // Squash on the way down, stretch on the way up, conserving volume --
      // the difference between something floating and something sliding.
      { scaleX: 1 + (1 - bob.value) * 0.025 + breath.value * 0.01 },
      { scaleY: 1 - (1 - bob.value) * 0.025 + breath.value * 0.015 },
    ],
  }))

  // The shadow does as much work as the body: without it the creature reads as
  // pasted onto the screen rather than standing above something.
  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 - bob.value * 0.2 }],
    opacity: 0.3 - bob.value * 0.12,
  }))

  const height = size * RATIO

  return (
    <View style={[styles.root, { width: size, height: height + size * 0.08 }]}>
      <Animated.View
        style={[
          styles.shadow,
          { width: size * 0.62, height: size * 0.07 },
          shadowStyle,
        ]}
      />
      <Animated.View style={bodyStyle}>
        <Image
          source={creatureSource(colour)}
          style={{ width: size, height }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  )
}

const makeStyles = () =>
  StyleSheet.create({
    root: { alignItems: 'center', justifyContent: 'flex-end' },
    shadow: {
      position: 'absolute',
      bottom: 0,
      borderRadius: 999,
      backgroundColor: '#000',
    },
  })
