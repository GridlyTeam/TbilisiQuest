import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useTheme, radius, space, type Palette } from '../lib/theme'

/**
 * Where the creature stands.
 *
 * Every background is a painted place -- Mtatsminda, Rike, the Bridge of Peace
 * -- and none of those pictures exist yet, so each one is a colour pair and a
 * horizon until it does. Swapping a gradient for an Image later is a change
 * inside this file; nothing that equips a background has to know.
 *
 * The pedestal is not decoration. Without a surface the creature reads as
 * floating in a void, and the whole point of a background is to say where its
 * owner spends their time.
 */

type Scene = { top: string; bottom: string; glow: string; ka: string; en: string }

export const BACKGROUNDS: Record<string, Scene> = {
  mtatsminda: {
    top: '#1B1040',
    bottom: '#4A2360',
    glow: 'rgba(255,176,32,0.35)',
    ka: 'მთაწმინდა',
    en: 'Mtatsminda',
  },
  rike: {
    top: '#0F2A3A',
    bottom: '#1C5566',
    glow: 'rgba(59,214,255,0.3)',
    ka: 'რიყე',
    en: 'Rike',
  },
  fabrika: {
    top: '#2A1220',
    bottom: '#5A2438',
    glow: 'rgba(255,122,213,0.28)',
    ka: 'ფაბრიკა',
    en: 'Fabrika',
  },
  sololaki: {
    top: '#241A12',
    bottom: '#57392A',
    glow: 'rgba(255,176,32,0.25)',
    ka: 'სოლოლაკი',
    en: 'Sololaki',
  },
  bridge: {
    top: '#0C1230',
    bottom: '#27407A',
    glow: 'rgba(123,163,255,0.35)',
    ka: 'მშვიდობის ხიდი',
    en: 'Bridge of Peace',
  },
  funinight: {
    top: '#08060F',
    bottom: '#2B1A4A',
    glow: 'rgba(168,85,247,0.35)',
    ka: 'ფუნიკულიორი',
    en: 'Funicular',
  },
}

export default function Stage({
  background,
  children,
  ka = true,
  height = 280,
}: {
  /** A background cosmetic's style_key; anything unknown is the empty stage. */
  background?: string | null
  children: ReactNode
  ka?: boolean
  height?: number
}) {
  const { c } = useTheme()
  const styles = makeStyles(c)
  const scene = BACKGROUNDS[background ?? '']

  return (
    <View
      style={[
        styles.root,
        { height, backgroundColor: scene?.bottom ?? c.surface },
      ]}
    >
      {/* The sky. Two flat bands rather than a gradient: React Native has no
          gradient without another native dependency, and at this size the seam
          is invisible under the glow. */}
      <View style={[styles.sky, { backgroundColor: scene?.top ?? c.surfaceRaised }]} />

      {/* A wash of light behind the creature, the colour of the place. It is
          what stops the two bands reading as two rectangles. */}
      <View
        style={[
          styles.glow,
          { backgroundColor: scene?.glow ?? 'rgba(255,176,32,0.14)' },
        ]}
      />

      <View style={styles.pedestal} />

      <View style={styles.subject}>{children}</View>

      {scene && (
        <Text style={styles.label}>{ka ? scene.ka : scene.en}</Text>
      )}
    </View>
  )
}

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
    glow: {
      position: 'absolute',
      bottom: '18%',
      width: 260,
      height: 260,
      borderRadius: 130,
    },
    // A shallow ellipse the creature stands on, dark enough to read on every
    // background without being a colour of its own.
    pedestal: {
      position: 'absolute',
      bottom: 26,
      width: 168,
      height: 34,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.28)',
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
