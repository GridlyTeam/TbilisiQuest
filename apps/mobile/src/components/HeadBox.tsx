import { Image, StyleSheet, View } from 'react-native'

import { useTheme } from '../lib/theme'
import { CREATURE_COLOURS as CREATURE, creatureSource } from './Creature'

/**
 * A player on the map: their creature, in a small bubble that points down at
 * where they are.
 *
 * It reads as a speech balloon on purpose -- a rounded box with a tail, the way
 * a comic marks who is talking. A plain square floating above a dot does not
 * say which dot it belongs to, and on a busy map that matters more than the
 * box being pretty.
 *
 * The crop shows the head and some of the body rather than filling the frame
 * with a face: framed tighter, the creature stops being recognisable as the
 * one standing on the Character tab.
 *
 * The image is oversized inside a clipped box rather than shipped as a second
 * set of head-only renders. One file per colour, and a map icon that can never
 * disagree with the profile.
 *
 * The outline is drawn in the text colour rather than the background one. That
 * looks like a detail and is not: the basemap follows the theme, so an outline
 * the colour of the background is the colour of the map behind it -- near-black
 * on the dark basemap, near-white on the light one. It was invisible in both
 * modes for the same reason.
 */

/** One palette, defined with the creature: two lists would drift apart. */
export const CREATURE_COLOURS: Record<string, string> = Object.fromEntries(
  Object.entries(CREATURE).map(([key, value]) => [key, value.body]),
)

export const DEFAULT_COLOUR = 'cyan'

/**
 * How far the artwork overflows the box. At 1.5 the creature ran edge to edge
 * and looked wedged in; a shade over 1 crops to head and shoulders while
 * leaving air on either side of it.
 */
const ZOOM = 1.15

export default function HeadBox({
  colour,
  size = 40,
  dimmed = false,
}: {
  colour?: string | null
  size?: number
  /** Approximate positions are drawn softer than the player's own. */
  dimmed?: boolean
}) {
  const { c } = useTheme()
  const styles = makeStyles()

  const outline = 2
  const tailW = Math.round(size * 0.2)
  const tailH = Math.round(size * 0.26)

  return (
    <View style={[styles.wrap, { opacity: dimmed ? 0.85 : 1 }]}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.34,
          borderWidth: outline,
          borderColor: c.text,
          backgroundColor: c.surface,
          overflow: 'hidden',
          alignItems: 'center',
          // A little air above the head, so the crop reads as framing rather
          // than as the picture being too big for its box.
          paddingTop: size * 0.08,
        }}
      >
        <Image
          source={creatureSource(colour)}
          style={{
            width: size * ZOOM,
            height: size * ZOOM * (407 / 308),
          }}
          resizeMode="contain"
        />
      </View>

      {/* The tail, drawn twice: the outer triangle carries the bubble's
          outline and the inner one its fill, which is the only way to get an
          outlined point out of border tricks. */}
      <View style={styles.tail}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: tailW,
            borderRightWidth: tailW,
            borderTopWidth: tailH,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: c.text,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: -outline,
            width: 0,
            height: 0,
            borderLeftWidth: tailW - outline,
            borderRightWidth: tailW - outline,
            borderTopWidth: tailH - outline,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: c.surface,
          }}
        />
      </View>
    </View>
  )
}

const makeStyles = () =>
  StyleSheet.create({
    wrap: { alignItems: 'center' },
    // Overlaps the bubble's own outline so the tail grows out of it rather
    // than hanging below a seam.
    tail: { marginTop: -1, alignItems: 'center' },
  })
