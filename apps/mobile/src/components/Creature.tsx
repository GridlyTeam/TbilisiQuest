import { useEffect } from 'react'
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
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
 * The motion is code: it breathes, scaled from its feet so it never leaves the
 * ground. It used to float as well, which was one idea too many -- a creature
 * that hovers reads as a ghost rather than as somebody standing in a place.
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

/**
 * Every layer is written on one canvas at this shape, so the body and whatever
 * it is wearing stack with no offsets to get wrong.
 */
export const RATIO = 540 / 392

/**
 * Everything the creature can wear, lifted out of a render of it wearing that
 * thing by subtracting the bare render. Each carries its own colours, so one
 * file dresses all eight bodies -- the difference between one render per item
 * and eight.
 *
 * Keyed by style_key, which is what the database hands the app.
 */
const LAYERS: Record<string, ImageSourcePropType> = {
  hoodie_fab: require('../../assets/creature/layer-hoodie_fab.png'),
  shades_cat: require('../../assets/creature/layer-shades_cat.png'),
}

export function layerSource(key?: string | null): ImageSourcePropType | null {
  return LAYERS[key ?? ''] ?? null
}

export function creatureSource(colour?: string | null): ImageSourcePropType {
  return BODIES[colour ?? ''] ?? BODIES[DEFAULT_COLOUR]
}

export default function Creature({
  colour,
  outfit,
  eyewear,
  size = 180,
  animate = true,
}: {
  colour?: string | null
  /** style_keys from the cosmetics; unknown keys wear nothing. */
  outfit?: string | null
  eyewear?: string | null
  size?: number
  animate?: boolean
}) {
  const styles = makeStyles()

  // It stands on the ground rather than hovering over it. What is left is
  // breathing: the body widens and settles a little, anchored at the feet, so
  // it is alive without drifting anywhere.
  const breath = useSharedValue(0)

  useEffect(() => {
    if (!animate) return

    breath.value = withRepeat(
      withTiming(1, { duration: 3100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
  }, [animate, breath])

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: 1 + breath.value * 0.012 },
      { scaleY: 1 + breath.value * 0.018 },
    ],
  }))

  // Drawn in the order they sit: clothes on the body, glasses over the face.
  const worn = [layerSource(outfit), layerSource(eyewear)].filter(Boolean)
  const height = size * RATIO

  return (
    <View style={[styles.root, { width: size, height: height + size * 0.08 }]}>
      {/* Stacked rather than one ellipse: a single flat oval reads as a
          sticker under the feet, and React Native has no blur to soften it
          with. Three at a low alpha each pile up in the middle and thin out
          at the rim, which is what a real contact shadow does. */}
      <View style={[styles.shadowSlot, { opacity: 0.3 }]}>
        {[1, 0.7, 0.44].map((scale, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: size * 0.62 * scale,
              height: size * 0.07 * scale,
              borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          />
        ))}
      </View>
      <Animated.View style={[bodyStyle, { transformOrigin: 'bottom' }]}>
        <Image
          source={creatureSource(colour)}
          style={{ width: size, height }}
          resizeMode="contain"
        />
        {/* Over the body on the same canvas, so each lands where it was
            drawn -- no offsets to get wrong. */}
        {worn.map((layer, i) => (
          <Image
            key={i}
            source={layer as ImageSourcePropType}
            style={{ position: 'absolute', width: size, height }}
            resizeMode="contain"
          />
        ))}
      </Animated.View>
    </View>
  )
}

const makeStyles = () =>
  StyleSheet.create({
    root: { alignItems: 'center', justifyContent: 'flex-end' },
    shadowSlot: {
      position: 'absolute',
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
