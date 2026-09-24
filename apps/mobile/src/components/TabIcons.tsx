import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native'

/**
 * The tab bar's icons, and the two that sit on the map.
 *
 * These were drawn from Views for a while, because the alternative looked like
 * adding react-native-svg -- a native module, and so a full rebuild -- for a
 * handful of shapes. The artwork that replaced them is full-colour
 * illustration rather than monochrome glyphs, which rules out tinting: an
 * Image tinted with `tintColor` collapses to one flat colour, and these have
 * four or five each.
 *
 * So they are rasterised to PNG at three densities and drawn at full colour,
 * and the selected tab is marked by opacity rather than by hue. That keeps the
 * whole set free of native dependencies, which is what lets these arrive over
 * a reload instead of a twenty minute build.
 *
 * Rasterised from the SVGs by tools/rasterise-icons.js.
 */

const ICONS = {
  map: require('../../assets/icons/map.png') as ImageSourcePropType,
  voucher: require('../../assets/icons/voucher.png') as ImageSourcePropType,
  character: require('../../assets/icons/character.png') as ImageSourcePropType,
  season: require('../../assets/icons/season.png') as ImageSourcePropType,
  store: require('../../assets/icons/store.png') as ImageSourcePropType,
  info: require('../../assets/icons/info.png') as ImageSourcePropType,
}

type Props = {
  /** Kept for call sites that still pass a tint; colour icons ignore it. */
  color?: unknown
  size?: number
  /** Tabs pass this; the map buttons do not. */
  focused?: boolean
}

function Icon({
  name,
  size = 26,
  focused,
}: {
  name: keyof typeof ICONS
  size?: number
  focused?: boolean
}) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Image
        source={ICONS[name]}
        style={{
          width: size,
          height: size,
          // The unselected tab is dimmed rather than greyed: these are
          // pictures, and a picture at 45% still reads as itself.
          opacity: focused === false ? 0.45 : 1,
        }}
        resizeMode="contain"
      />
    </View>
  )
}

export function MapIcon({ size, focused }: Props) {
  return <Icon name="map" size={size} focused={focused} />
}

export function VoucherIcon({ size, focused }: Props) {
  return <Icon name="voucher" size={size} focused={focused} />
}

/** The Character tab wears the mascot's own face. */
export function ProfileIcon({ size, focused }: Props) {
  return <Icon name="character" size={size} focused={focused} />
}

export function PassIcon({ size, focused }: Props) {
  return <Icon name="season" size={size} focused={focused} />
}

export function StoreIcon({ size, focused }: Props) {
  return <Icon name="store" size={size} focused={focused} />
}

export function InfoIcon({ size, focused }: Props) {
  return <Icon name="info" size={size} focused={focused} />
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
})
