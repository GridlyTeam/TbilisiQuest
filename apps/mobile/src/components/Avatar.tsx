import { StyleSheet, Text, View } from 'react-native'

import { useTheme, radius, type Palette } from '../lib/theme'

/**
 * The character.
 *
 * Drawn from Views rather than illustrated, for now. Illustration is the right
 * answer eventually, but six outfits have to sit on one body in one pose or
 * changing gear changes the character -- that is a character sheet, not six
 * pictures, and it can be dropped in behind this component without the slots
 * or the database moving.
 *
 * What matters today is that equipping something visibly does something. Every
 * slot here reads off the same avatar_config the server validates:
 *
 *   outfit  -> the hoodie's colour and the stripe down it
 *   frame   -> the ring around the whole figure
 *   sticker -> the badge pinned to the corner
 *   marker  -> the pin floating beside the head
 *   title   -> the line under the name, handled by whoever renders this
 */

/** style_key -> the two colours an outfit is built from. */
const OUTFITS: Record<string, { body: string; trim: string }> = {
  hoodie_fab: { body: '#2B2340', trim: '#FFB020' },
  track_sab: { body: '#14324A', trim: '#3BD6FF' },
  denim_vake: { body: '#243B63', trim: '#E8E3F5' },
  coat_rust: { body: '#3A2418', trim: '#C97B3A' },
  jacket_dry: { body: '#2F3B2A', trim: '#3BE08A' },
  wind_marj: { body: '#3A1F3D', trim: '#A855F7' },
}

const FRAMES: Record<string, string> = {
  copper: '#C97B3A',
  cyan: '#3BD6FF',
  emerald: '#3BE08A',
  gold: '#FFB020',
  midnight: '#7C5CFF',
  violet: '#A855F7',
}

const PINS: Record<string, string> = {
  pin_neon: '#3BD6FF',
  pin_grape: '#A855F7',
  pin_flame: '#FF7A3B',
  pin_ghost: '#E8E3F5',
  pin_gold: '#FFB020',
}

/** Stickers are a glyph and a colour: a drawn sulfur bath is beyond Views. */
const STICKERS: Record<string, { glyph: string; color: string }> = {
  khachapuri: { glyph: '◕', color: '#FFB020' },
  funicular: { glyph: '▲', color: '#3BD6FF' },
  river: { glyph: '≋', color: '#3BD6FF' },
  boba: { glyph: '◉', color: '#A855F7' },
  grape: { glyph: '❦', color: '#A855F7' },
  metro: { glyph: 'Ⓜ', color: '#3BE08A' },
  sulfur: { glyph: '☵', color: '#FFB020' },
  balcony: { glyph: '⌂', color: '#C97B3A' },
}

export type AvatarStyles = {
  outfit?: string
  frame?: string
  marker?: string
  sticker?: string
}

/**
 * Takes style keys, not cosmetic codes: the screen looks the codes up in the
 * catalogue it already loaded, so this component never has to query anything.
 */
export default function Avatar({
  styles: worn,
  size = 132,
}: {
  styles: AvatarStyles
  size?: number
}) {
  const { c } = useTheme()
  const s = makeStyles(c)

  const outfit = OUTFITS[worn.outfit ?? ''] ?? {
    body: c.surfaceRaised,
    trim: c.border,
  }
  const frame = FRAMES[worn.frame ?? ''] ?? c.border
  const pin = PINS[worn.marker ?? '']
  const sticker = STICKERS[worn.sticker ?? '']

  const unit = size / 132

  return (
    <View
      style={[
        s.frame,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: frame,
          borderWidth: worn.frame ? 3 : 1,
        },
      ]}
    >
      {/* Shoulders first, so the head sits over the collar. */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: size * 0.72,
          height: size * 0.46,
          borderTopLeftRadius: size * 0.36,
          borderTopRightRadius: size * 0.36,
          backgroundColor: outfit.body,
          overflow: 'hidden',
          alignItems: 'center',
        }}
      >
        {/* The trim stripe: the one mark that tells two outfits apart at
            thumbnail size. */}
        <View
          style={{
            width: 5 * unit,
            height: '100%',
            backgroundColor: outfit.trim,
            opacity: 0.9,
          }}
        />
      </View>

      <View
        style={{
          position: 'absolute',
          bottom: size * 0.34,
          width: size * 0.34,
          height: size * 0.34,
          borderRadius: size * 0.17,
          backgroundColor: c.text,
        }}
      />

      {/* The hood, sitting on the back of the head. */}
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.46,
          width: size * 0.42,
          height: size * 0.2,
          borderTopLeftRadius: size * 0.21,
          borderTopRightRadius: size * 0.21,
          backgroundColor: outfit.body,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderColor: outfit.trim,
        }}
      />

      {pin && (
        <View style={[s.pin, { borderColor: pin, right: size * 0.06, top: size * 0.14 }]}>
          <View style={[s.pinDot, { backgroundColor: pin }]} />
        </View>
      )}

      {sticker && (
        <View
          style={[
            s.sticker,
            { borderColor: sticker.color, left: size * 0.02, top: size * 0.2 },
          ]}
        >
          <Text style={{ color: sticker.color, fontSize: 14 }}>
            {sticker.glyph}
          </Text>
        </View>
      )}
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    frame: {
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    pin: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinDot: { width: 6, height: 6, borderRadius: 3 },
    sticker: {
      position: 'absolute',
      width: 26,
      height: 26,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
