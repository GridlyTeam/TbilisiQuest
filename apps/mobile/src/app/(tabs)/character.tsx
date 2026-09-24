import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import Creature, { CREATURE_COLOURS, layerSource } from '../../components/Creature'
import Stage, { BACKGROUNDS } from '../../components/Stage'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import {
  useTheme,
  useRarity,
  radius,
  space,
  font,
  type Palette,
  type Rarity,
} from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Cosmetic = {
  code: string
  kind: string
  title_ka: string
  title_en: string
  style_key: string
  rarity: Rarity
  owned: boolean
  available: boolean
  season_code: string | null
}

type AvatarRow = {
  avatar_config: Record<string, string> | null
  equipped_title: string | null
  equipped_frame: string | null
  display_name: string | null
}

/**
 * Which cosmetic kind fills which slot. The slot name is what goes into
 * avatar_config, and the database mirrors two of them -- title and frame --
 * into their own columns.
 *
 * A slot only appears once something in it can be seen. Titles, frames, map
 * pins, stickers and card themes are all real rows in the catalogue that
 * nothing draws yet, and a locker full of gear that changes nothing when
 * equipped teaches players that equipping does nothing. They come back with
 * their artwork.
 */
const SLOTS: Array<{ slot: string; kind: string; ka: string; en: string }> = [
  { slot: 'outfit', kind: 'outfit', ka: 'ტანსაცმელი', en: 'Outfit' },
  { slot: 'eyewear', kind: 'eyewear', ka: 'სათვალე', en: 'Eyewear' },
  { slot: 'background', kind: 'background', ka: 'ფონი', en: 'Background' },
]

/** Whether the app has anything to draw for this item yet. */
function isDrawable(kind: string, styleKey: string): boolean {
  if (kind === 'background') return BACKGROUNDS[styleKey] != null
  return layerSource(styleKey) != null
}

/**
 * The locker.
 *
 * Shows the whole catalogue, not only what has been earned: the locked rows
 * are the reason to keep climbing the pass, and a locker that hides them is a
 * list of things you already have.
 *
 * Equipping writes the whole config in one call rather than a field at a time,
 * because the server validates ownership across the object and a partial write
 * would let a half-valid avatar exist.
 */
export default function InventoryScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const rarity = useRarity()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [items, setItems] = useState<Cosmetic[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [cosmetics, avatar] = await Promise.all([
      supabase.rpc('my_cosmetics'),
      supabase.rpc('my_avatar'),
    ])
    setItems((cosmetics.data as Cosmetic[]) ?? [])
    const row = (Array.isArray(avatar.data) ? avatar.data[0] : avatar.data) as
      | AvatarRow
      | undefined
    setConfig(row?.avatar_config ?? {})
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // Set once at sign-up and then unreachable, which made the one choice
  // everybody makes the one choice nobody could revisit.
  const recolour = useCallback(
    async (colour: string) => {
      const next = { ...config, colour }
      setConfig(next)
      const { error: rpcError } = await supabase.rpc('set_avatar_config', {
        p_config: next,
      })
      if (rpcError) {
        setError(ka ? 'ვერ შეინახა. სცადე ხელახლა.' : 'That did not save. Try again.')
        await load()
      }
    },
    [config, ka, load],
  )

  const equip = useCallback(
    async (slot: string, code: string) => {
      // Tapping what you are already wearing takes it off, which is the only
      // way to empty a slot without a separate control.
      const next = { ...config }
      if (next[slot] === code) delete next[slot]
      else next[slot] = code

      setConfig(next)
      setSaving(true)
      setError(null)

      const { error: rpcError } = await supabase.rpc('set_avatar_config', {
        p_config: next,
      })
      setSaving(false)

      if (rpcError) {
        setError(
          ka ? 'ვერ შეინახა. სცადე ხელახლა.' : 'That did not save. Try again.',
        )
        await load()
      }
    },
    [config, ka, load],
  )

  // Counted over what the locker actually shows. Counting the whole catalogue
  // while displaying a fraction of it reads as a broken screen.
  const shown = items.filter((i) => isDrawable(i.kind, i.style_key))
  const owned = shown.filter((i) => i.owned).length

  // Style keys, not codes: the catalogue is already loaded here, so the stage
  // never has to query anything.
  const keyFor = useCallback(
    (slot: string) => items.find((i) => i.code === config[slot])?.style_key,
    [config, items],
  )

  const equippedTitle = items.find((i) => i.code === config.title)

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  return (
    <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* The stage. The creature is the point of the screen, so it gets the
            top of it at full size, standing in whatever background is
            equipped, moving on its own. */}
        <Stage background={keyFor('background')} tint={config.colour} ka={ka}>
          <Creature
            colour={config.colour}
            outfit={keyFor('outfit')}
            eyewear={keyFor('eyewear')}
            size={170}
          />
        </Stage>

        <Text style={styles.previewTitle} numberOfLines={2}>
          {equippedTitle
            ? ka
              ? equippedTitle.title_ka
              : equippedTitle.title_en
            : ka
              ? 'წოდება არ გაქვს არჩეული'
              : 'No title equipped'}
        </Text>
        <Text style={styles.summary}>
          {ka
            ? `${owned} ${shown.length}-დან შეგროვებული`
            : `${owned} of ${shown.length} collected`}
        </Text>

        <Text style={styles.sectionTitle}>{ka ? 'ფერი' : 'Colour'}</Text>
        <View style={styles.swatches}>
          {Object.entries(CREATURE_COLOURS).map(([key, tone]) => (
            <Pressable
              key={key}
              onPress={() => recolour(key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: config.colour === key }}
              style={[
                styles.swatch,
                { backgroundColor: tone.body },
                config.colour === key && { borderColor: c.text },
              ]}
            />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {SLOTS.map((slot) => {
          const group = items.filter(
            (i) => i.kind === slot.kind && isDrawable(i.kind, i.style_key),
          )
          if (group.length === 0) return null

          return (
            <View key={slot.slot} style={styles.section}>
              <Text style={styles.sectionTitle}>{ka ? slot.ka : slot.en}</Text>

              <View style={styles.grid}>
                {group.map((item) => {
                  const meta = rarity[item.rarity] ?? rarity.common
                  const isWorn = config[slot.slot] === item.code

                  return (
                    <Pressable
                      key={item.code}
                      disabled={!item.owned || saving}
                      onPress={() => equip(slot.slot, item.code)}
                      style={[
                        styles.item,
                        !item.owned && styles.itemLocked,
                        isWorn && { borderColor: meta.color, borderWidth: 2 },
                      ]}
                    >
                      {/* The rarity is the only colour on the card, so a
                          legendary reads as different from across the room. */}
                      <View
                        style={[styles.chip, { backgroundColor: meta.fill }]}
                      >
                        <Text style={[styles.chipText, { color: meta.color }]}>
                          {ka ? meta.label.ka : meta.label.en}
                        </Text>
                      </View>

                      <Text
                        style={[styles.itemName, !item.owned && styles.dim]}
                        numberOfLines={2}
                      >
                        {ka ? item.title_ka : item.title_en}
                      </Text>

                      <Text
                        style={[
                          styles.itemState,
                          isWorn && { color: meta.color },
                        ]}
                      >
                        {isWorn
                          ? ka
                            ? 'ეცვა'
                            : 'Worn'
                          : item.owned
                            ? ka
                              ? 'ჩაიცვი'
                              : 'Wear'
                            : item.available === false
                              ? ka
                                ? 'სეზონი დასრულდა'
                                : 'Vaulted'
                              : ka
                                ? 'ჩაკეტილი'
                                : 'Locked'}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          )
        })}

        <Text style={styles.footnote}>
          {ka
            ? 'ნივთები იხსნება ქალაქის ბილეთით, მაღაზიაში და სერიით. მეტი მალე.'
            : 'Gear comes from the City Pass, the store and streaks. More soon.'}
        </Text>
    </ScrollView>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: space.lg, paddingBottom: space.xl },
    centre: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewTitle: {
      textAlign: 'center',
      color: c.text,
      fontSize: 17,
      fontWeight: '900',
      letterSpacing: 0,
      marginTop: space.md,
      marginBottom: 2,
    },
    summary: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    error: { color: c.bad, fontSize: 13, marginTop: space.sm },

    section: { marginTop: space.lg },
    sectionTitle: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
      marginBottom: space.sm,
    },

    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    swatch: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 3,
      borderColor: 'transparent',
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    item: {
      width: '31%',
      minHeight: 104,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: space.sm,
      justifyContent: 'space-between',
    },
    // Locked gear stays legible rather than being greyed into nothing: it is
    // an advert, not a placeholder.
    itemLocked: { opacity: 0.6, borderStyle: 'dashed' },
    dim: { color: c.textMuted },

    chip: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    chipText: { fontSize: 9, fontWeight: '900' },

    itemName: { color: c.text, fontSize: 12, fontWeight: '800', marginTop: 6 },
    itemState: { color: c.textFaint, fontSize: 10, fontWeight: '800' },

    footnote: { color: c.textFaint, fontSize: 12, marginTop: space.lg },
  })
