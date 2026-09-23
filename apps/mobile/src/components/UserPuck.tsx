import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { useTheme } from '../lib/theme'

/**
 * Where you are, as something worth looking at.
 *
 * MapLibre's stock puck is a flat blue dot in a colour the app uses nowhere
 * else. This replaces it with the brand amber and gives it a heartbeat: a soft
 * static halo, a bright core, and two rings that expand and fade out of it on
 * a staggered loop so the map always has one thing quietly moving.
 *
 * The rings run on Reanimated's UI thread, so the pulse keeps its rhythm while
 * the list refetches or the map tiles load -- a pulse that stutters looks
 * broken in a way a still dot never does.
 */
const CYCLE = 2400
const PUCK = 22

export default function UserPuck() {
  const { c } = useTheme()

  const first = useSharedValue(0)
  const second = useSharedValue(0)

  useEffect(() => {
    const ring = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withTiming(1, { duration: CYCLE, easing: Easing.out(Easing.quad) }),
          -1,
          false,
        ),
      )
    first.value = ring(0)
    // Half a cycle behind, so one ring is always mid-flight.
    second.value = ring(CYCLE / 2)
  }, [first, second])

  // Written out twice rather than through a helper: a hook inside a function
  // called from render is a rule-of-hooks violation, and the React Compiler
  // refuses to compile it.
  const firstStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + first.value * 2.2 }],
    opacity: (1 - first.value) * 0.5,
  }))
  const secondStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + second.value * 2.2 }],
    opacity: (1 - second.value) * 0.5,
  }))

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.ring, { borderColor: c.accent }, firstStyle]}
      />
      <Animated.View
        style={[styles.ring, { borderColor: c.accent }, secondStyle]}
      />
      {/* A wide, very faint disc under the core: on a dark map this is what
          makes the dot look lit rather than drawn. */}
      <View style={[styles.halo, { backgroundColor: c.accent }]} />
      <View style={[styles.core, { backgroundColor: c.accent }]}>
        <View style={styles.pupil} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: PUCK * 3,
    height: PUCK * 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: PUCK,
    height: PUCK,
    borderRadius: PUCK / 2,
    borderWidth: 2,
  },
  halo: {
    position: 'absolute',
    width: PUCK * 1.9,
    height: PUCK * 1.9,
    borderRadius: PUCK,
    opacity: 0.16,
  },
  core: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A white centre reads as a light source; a plain amber disc reads as a pin.
  pupil: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
})
