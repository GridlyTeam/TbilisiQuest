import { useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { useTheme, radius, type Palette } from '../lib/theme'
import { CREATURE_COLOURS, DEFAULT_COLOUR } from './Creature'

/**
 * Where the creature stands.
 *
 * Every background is a painted place -- Mtatsminda, Rike, the Bridge of Peace
 * -- and none of those pictures exist yet, so each one is a colour pair and a
 * horizon until it does. Swapping a gradient for an Image later is a change
 * inside this file; nothing that equips a background has to know.
 *
 * Two things this had wrong, both visible on every account:
 *
 * The glow behind the creature was one 260px View with a 130px border radius,
 * which is not a glow -- React Native cannot blur a View, so it drew a
 * hard-edged circle sitting on the backdrop. It is stacked translucent rings
 * now, which is the only way to get a soft falloff without pulling in a native
 * gradient dependency for one effect.
 *
 * The pedestal ellipse that used to sit here is gone too: Creature casts its
 * own shadow, and that one shrinks as the creature rises, so a second static
 * one underneath it was both redundant and the thing that stopped the float
 * reading as a float.
 *
 * And with no background owned -- which is everybody, since backgrounds are
 * bought with coins -- the stage fell back to the theme's surface colours and
 * came out flat grey. The empty stage is the state almost every player is in,
 * so it is now tinted from the creature's own colour rather than treated as a
 * missing value.
 */

type Scene = { top: string; bottom: string; glow: string; ka: string; en: string }

export const BACKGROUNDS: Record<string, Scene> = {
  mtatsminda: {
    top: '#1B1040',
    bottom: '#4A2360',
    glow: '255,176,32',
    ka: 'მთაწმინდა',
    en: 'Mtatsminda',
  },
  rike: {
    top: '#0F2A3A',
    bottom: '#1C5566',
    glow: '59,214,255',
    ka: 'რიყე',
    en: 'Rike',
  },
  fabrika: {
    top: '#2A1220',
    bottom: '#5A2438',
    glow: '255,122,213',
    ka: 'ფაბრიკა',
    en: 'Fabrika',
  },
  sololaki: {
    top: '#241A12',
    bottom: '#57392A',
    glow: '255,176,32',
    ka: 'სოლოლაკი',
    en: 'Sololaki',
  },
  bridge: {
    top: '#0C1230',
    bottom: '#27407A',
    glow: '123,163,255',
    ka: 'მშვიდობის ხიდი',
    en: 'Bridge of Peace',
  },
  funinight: {
    top: '#08060F',
    bottom: '#2B1A4A',
    glow: '168,85,247',
    ka: 'ფუნიკულიორი',
    en: 'Funicular',
  },
}

/** '#RRGGBB' to 'r,g,b', so one colour can drive many alphas. */
function channels(hex: string): string {
  const v = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).join(',')
}

/** Darken towards black, for building a backdrop out of the creature's colour. */
function shade(hex: string, keep: number): string {
  const v = hex.replace('#', '')
  const parts = [0, 2, 4].map((i) =>
    Math.round(parseInt(v.slice(i, i + 2), 16) * keep),
  )
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/**
 * A radial glow, faked.
 *
 * Concentric rings of the same colour at a low alpha each: they accumulate
 * towards the middle and thin out at the edge, which is what a blur would do.
 * Enough rings and the steps stop being visible -- fewer and it bands.
 */
function SoftGlow({ rgb, size }: { rgb: string; size: number }) {
  const rings = 9
  return (
    <View style={[styles.centred, { width: size, height: size }]}>
      {Array.from({ length: rings }, (_, i) => {
        // Largest first, so the smallest and brightest ends up on top.
        const scale = 1 - i / rings
        const d = size * scale
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: `rgba(${rgb},0.05)`,
            }}
          />
        )
      })}
    </View>
  )
}

/** One drifting mote. Its own component because each needs its own hooks. */
function Mote({
  rgb,
  delay,
  left,
  size,
}: {
  rgb: string
  delay: number
  left: number
  size: number
}) {
  const t = useSharedValue(0)

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    )
  }, [delay, t])

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -t.value * 90 }],
    // Fades in from nothing and back out, so it never pops.
    opacity: Math.sin(t.value * Math.PI) * 0.5,
  }))

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: 40,
          left,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: `rgba(${rgb},0.9)`,
        },
        style,
      ]}
    />
  )
}

export default function Stage({
  background,
  tint,
  children,
  ka = true,
  height = 280,
  sparkle = true,
}: {
  /** A background cosmetic's style_key; anything unknown is the empty stage. */
  background?: string | null
  /** The creature's colour, used to tint the stage when nothing is equipped. */
  tint?: string | null
  children: ReactNode
  ka?: boolean
  height?: number
  sparkle?: boolean
}) {
  const { c } = useTheme()
  const s = makeStyles(c)
  const scene = BACKGROUNDS[background ?? '']

  // With nothing equipped the stage takes its colour from the creature, so an
  // empty stage still looks chosen rather than unfinished.
  const skin = CREATURE_COLOURS[tint ?? ''] ?? CREATURE_COLOURS[DEFAULT_COLOUR]
  const rgb = scene?.glow ?? channels(skin.body)
  const top = scene?.top ?? shade(skin.shade, 0.22)
  const bottom = scene?.bottom ?? shade(skin.body, 0.42)

  return (
    <View style={[s.root, { height, backgroundColor: bottom }]}>
      <View style={[s.sky, { backgroundColor: top }]} />

      <View style={s.glowSlot} pointerEvents="none">
        <SoftGlow rgb={rgb} size={height * 0.95} />
      </View>

      {sparkle && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Mote rgb={rgb} delay={0} left={52} size={4} />
          <Mote rgb={rgb} delay={1700} left={96} size={3} />
          <Mote rgb={rgb} delay={900} left={210} size={4} />
          <Mote rgb={rgb} delay={3100} left={248} size={3} />
          <Mote rgb={rgb} delay={2300} left={150} size={2} />
        </View>
      )}

      <View style={s.subject}>{children}</View>

      {scene && <Text style={s.label}>{ka ? scene.ka : scene.en}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  centred: { alignItems: 'center', justifyContent: 'center' },
})

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    sky: { position: 'absolute', top: 0, left: 0, right: 0, height: '62%' },
    glowSlot: {
      position: 'absolute',
      bottom: '14%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    subject: { paddingBottom: 18 },
    label: {
      position: 'absolute',
      bottom: 8,
      color: '#FFFFFF',
      opacity: 0.75,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0,
    },
  })
