import { useCallback, useMemo, useState } from 'react'
import { Stack, useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import Avatar, { type AvatarStyles } from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import {
  useTheme,
  useRarity,
  radius,
  space,
  font,
  type Palette,
  type Rarity,
} from '../lib/theme'

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
 */
const SLOTS: Array<{ slot: string; kind: string; ka: string; en: string }> = [
  { slot: 'title',  kind: 'title',        ka: 'წოდება',   en: 'Title' },
  { slot: 'frame',  kind: 'avatar_frame', ka: 'ჩარჩო',    en: 'Frame' },
  { slot: 'marker', kind: 'marker_skin',  ka: 'პინი',     en: 'Map pin' },
  { slot: 'outfit', kind: 'outfit',       ka: 'ტანსაცმელი', en: 'Outfit' },
  { slot: 'sticker', kind: 'sticker',     ka: 'სტიკერი',  en: 'Sticker' },
  { slot: 'theme',  kind: 'card_theme',   ka: 'თემა',     en: 'Card theme' },
]

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

  const owned = items.filter((i) => i.owned).length

  // The avatar takes style keys, not codes: the catalogue is already here, so
  // the component never has to query anything.
  const worn: AvatarStyles = useMemo(() => {
    const keyFor = (slot: string) =>
      items.find((i) => i.code === config[slot])?.style_key
    return {
      outfit: keyFor('outfit'),
      frame: keyFor('frame'),
      marker: keyFor('marker'),
      sticker: keyFor('sticker'),
    }
  }, [config, items])

  const equippedTitle = items.find((i) => i.code === config.title)

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{ title: ka ? 'ჩემი ნივთები' : 'My locker' }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* The point of the screen: what you are wearing, changing as you
            tap. Without it the locker is a list of words. */}
        <View style={styles.preview}>
          <Avatar styles={worn} size={132} />
          <View style={styles.previewMeta}>
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
                ? `${owned} ${items.length}-დან შეგროვებული`
                : `${owned} of ${items.length} collected`}
            </Text>
          </View>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}

        {SLOTS.map((slot) => {
          const group = items.filter((i) => i.kind === slot.kind)
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
            ? 'ნივთები იხსნება ქალაქის ბილეთით, სერიით და ნიშნებით.'
            : 'Gear unlocks through the City Pass, streaks and badges.'}
        </Text>
      </ScrollView>
    </>
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
    preview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.lg,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
    },
    previewMeta: { flex: 1 },
    previewTitle: {
      color: c.text,
      fontSize: 17,
      fontWeight: '900',
      letterSpacing: 0,
      marginBottom: 4,
    },
    summary: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
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
