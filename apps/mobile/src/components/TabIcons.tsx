import { type ColorValue, StyleSheet, View } from 'react-native'

import { useTheme } from '../lib/theme'

/**
 * The tab bar used typographic glyphs -- a circle, a diamond, a filled
 * diamond -- which say nothing about where they lead. These are drawn instead.
 *
 * They are built from plain Views rather than SVG on purpose: react-native-svg
 * is a native module, so adding it would cost a full rebuild for three small
 * shapes, and an outline pin, a ticket and a bust are all borders and radii.
 * Every line takes its colour from the tab bar's active/inactive tint, so the
 * icons light up with their label.
 */

type Props = { color: ColorValue; size?: number }

export function MapIcon({ color, size = 22 }: Props) {
  const panel = Math.round(size * 0.32)
  const tall = Math.round(size * 0.72)
  return (
    <View style={[styles.box, { width: size, height: size, flexDirection: 'row' }]}>
      {/* A paper map: three panels side by side with the middle one dipping,
          the way a folded map hangs when you hold it open. The panels overlap
          by a border width so the creases read as single lines rather than
          two outlines touching. */}
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: panel,
            height: tall,
            marginTop: i === 1 ? 4 : 0,
            marginLeft: i === 0 ? 0 : -1.5,
            borderWidth: 1.5,
            borderColor: color,
            borderRadius: 1.5,
          }}
        />
      ))}
    </View>
  )
}

export function VoucherIcon({ color, size = 22 }: Props) {
  const { c } = useTheme()
  const w = size
  const h = Math.round(size * 0.68)
  const notch = 6
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: w,
          height: h,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 4,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingRight: 4,
        }}
      >
        {/* The tear line, three dots rather than a dashed border: Android
            draws dashes on a single side unreliably. */}
        <View style={{ gap: 2 }}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <View style={[styles.dot, { backgroundColor: color }]} />
          <View style={[styles.dot, { backgroundColor: color }]} />
        </View>
      </View>
      {/* Two bites out of the top and bottom edges, painted in the tab bar's
          own background so the outline appears to be cut. */}
      <View
        style={{
          position: 'absolute',
          top: (size - h) / 2 - notch / 2,
          right: 4,
          width: notch,
          height: notch,
          borderRadius: notch / 2,
          backgroundColor: c.bg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: (size - h) / 2 - notch / 2,
          right: 4,
          width: notch,
          height: notch,
          borderRadius: notch / 2,
          backgroundColor: c.bg,
        }}
      />
    </View>
  )
}

export function StoreIcon({ color, size = 22 }: Props) {
  const w = Math.round(size * 0.82)
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {/* A shop: an awning over a counter. The scallops are what stop it
          reading as a plain box. */}
      <View style={{ flexDirection: 'row', gap: 0 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: w / 3,
              height: 6,
              borderWidth: 1.5,
              borderColor: color,
              borderTopLeftRadius: i === 0 ? 2 : 0,
              borderTopRightRadius: i === 2 ? 2 : 0,
              marginLeft: i === 0 ? 0 : -1.5,
            }}
          />
        ))}
      </View>
      <View
        style={{
          width: w - 4,
          height: Math.round(size * 0.42),
          borderWidth: 1.5,
          borderTopWidth: 0,
          borderColor: color,
          marginTop: -1,
        }}
      />
    </View>
  )
}

export function PassIcon({ color, size = 22 }: Props) {
  const medal = Math.round(size * 0.5)
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {/* A medal: the ribbon first so the disc sits over its ends. */}
      <View style={{ flexDirection: 'row', gap: 3, marginBottom: -4 }}>
        {[-14, 14].map((angle) => (
          <View
            key={angle}
            style={{
              width: 4,
              height: 9,
              borderWidth: 1.5,
              borderColor: color,
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        ))}
      </View>
      <View
        style={{
          width: medal,
          height: medal,
          borderRadius: medal / 2,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  )
}

export function ProfileIcon({ color, size = 22 }: Props) {
  const head = Math.round(size * 0.38)
  const shoulders = Math.round(size * 0.74)
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      {/* An arch, not a half circle: the bottom border is dropped so the
          shoulders run off the base of the icon the way a bust does. */}
      <View
        style={{
          width: shoulders,
          height: Math.round(size * 0.36),
          marginTop: 2,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: shoulders,
          borderTopRightRadius: shoulders,
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: 2, height: 2, borderRadius: 1 },
})
