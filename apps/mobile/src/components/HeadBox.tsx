import { Image, StyleSheet, View } from 'react-native'

import { useTheme } from '../lib/theme'
import { CREATURE_COLOURS as CREATURE, creatureSource } from './Creature'

/**
 * A player on the map: their creature's head, cropped into a small box above
 * the dot.
 *
 * The crop is done by oversizing the image inside a clipped box and pushing it
 * up, rather than by shipping a second set of head-only renders. One asset,
 * two uses, and a colour that can never disagree with itself.
 */

/** One palette, defined with the creature: two lists would drift apart. */
export const CREATURE_COLOURS: Record<string, string> = Object.fromEntries(
  Object.entries(CREATURE).map(([key, value]) => [key, value.body]),
)

export const DEFAULT_COLOUR = 'cyan'

export default function HeadBox({
  colour,
  size = 34,
  dimmed = false,
}: {
  colour?: string | null
  size?: number
  /** Approximate positions are drawn softer than the player's own. */
  dimmed?: boolean
}) {
  const { c } = useTheme()
  const styles = makeStyles()

  return (
    <View style={styles.wrap}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.32,
          borderWidth: 2,
          borderColor: c.bg,
          backgroundColor: c.surface,
          overflow: 'hidden',
          opacity: dimmed ? 0.85 : 1,
          alignItems: 'center',
        }}
      >
        {/* Two and a bit times the box, pushed up by a fifth of its height:
            that lands the eyes in the middle of the frame. */}
        <Image
          source={creatureSource(colour)}
          style={{
            width: size * 2.1,
            height: size * 2.1 * (407 / 308),
            marginTop: -size * 0.22,
          }}
          resizeMode="contain"
        />
      </View>

      {/* The tail that ties the box to the point it stands on. */}
      <View
        style={{
          width: 0,
          height: 0,
          marginTop: -1,
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderTopWidth: 7,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: c.bg,
        }}
      />
    </View>
  )
}

const makeStyles = () =>
  StyleSheet.create({
    wrap: { alignItems: 'center' },
  })
