import { StyleSheet, View } from 'react-native'

import { useTheme } from '../lib/theme'
import { CREATURE_COLOURS as CREATURE } from './Creature'

/**
 * A player on the map: a crop of their character's head in a small box, sitting
 * above the dot.
 *
 * The same box is used for the player themselves and for everybody else, so a
 * map full of people reads as one kind of thing. Drawn for now; when the
 * generated character exists this becomes an Image with the same outer shape,
 * and nothing that positions it has to change.
 */

/**
 * One palette, defined with the creature. Two lists of colours called the same
 * names is how a player ends up cyan on the map and blue on their own profile.
 */
export const CREATURE_COLOURS: Record<string, string> = Object.fromEntries(
  Object.entries(CREATURE).map(([key, value]) => [key, value.body]),
)

export const DEFAULT_COLOUR = 'cyan'

export default function HeadBox({
  colour,
  size = 34,
  dimmed = false,
}: {
  /** A key from CREATURE_COLOURS; anything unknown falls back to the default. */
  colour?: string | null
  size?: number
  /** Approximate positions are drawn softer than the player's own. */
  dimmed?: boolean
}) {
  const { c } = useTheme()
  const styles = makeStyles()
  const fill = CREATURE_COLOURS[colour ?? ''] ?? CREATURE_COLOURS[DEFAULT_COLOUR]
  const eye = Math.max(3, Math.round(size * 0.1))

  return (
    <View style={styles.wrap}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: fill,
          borderWidth: 2,
          borderColor: c.bg,
          opacity: dimmed ? 0.85 : 1,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: eye,
        }}
      >
        {/* Two eyes and nothing else. At 34px a mouth is a smudge. */}
        <View
          style={{
            width: eye,
            height: eye * 1.4,
            borderRadius: eye,
            backgroundColor: '#0B0714',
          }}
        />
        <View
          style={{
            width: eye,
            height: eye * 1.4,
            borderRadius: eye,
            backgroundColor: '#0B0714',
          }}
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
