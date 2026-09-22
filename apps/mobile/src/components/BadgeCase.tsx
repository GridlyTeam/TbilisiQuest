import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, font, type Palette } from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Badge = {
  code: string
  title_ka: string
  title_en: string
  description_ka: string | null
  description_en: string | null
  icon_key: string
  target: number
  earned: boolean
  awarded_at: string | null
}

/**
 * The trophy shelf.
 *
 * Locked badges stay visible rather than hidden, because the empty slots are
 * the motivation: a shelf with three filled and five outlined is a to-do list
 * someone actually wants to finish. Earned ones sort first so the shelf reads
 * as an achievement, not a chore list.
 *
 * Icons are drawn from a key rather than shipped as images -- a new badge is a
 * row in the database plus one entry here, not an asset pipeline.
 */
const GLYPH: Record<string, string> = {
  boot: '➤',
  star: '★',
  map: '✧',
  chest: '❖',
  flame: '🔥',
  people: '❉',
}

export default function BadgeCase() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'
  const [badges, setBadges] = useState<Badge[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_badges')
    setBadges((data ?? []) as Badge[])
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (badges.length === 0) return null

  const earned = badges.filter((b) => b.earned).length

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>{ka ? 'ნიშნები' : 'Badges'}</Text>
        <Text style={styles.count}>
          {earned} / {badges.length}
        </Text>
      </View>

      <View style={styles.grid}>
        {badges.map((badge) => (
          <View
            key={badge.code}
            style={[styles.badge, badge.earned && styles.badgeOn]}
          >
            <Text
              style={[
                styles.glyph,
                { color: badge.earned ? c.accent : c.textFaint },
              ]}
            >
              {GLYPH[badge.icon_key] ?? '✦'}
            </Text>
            <Text
              style={[
                styles.title,
                { color: badge.earned ? c.text : c.textFaint },
              ]}
              numberOfLines={2}
            >
              {ka ? badge.title_ka : badge.title_en}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
      gap: space.md,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: font.eyebrow.letterSpacing,
      textTransform: 'uppercase',
    },
    count: { color: c.text, fontSize: 13, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    badge: {
      width: '31%',
      aspectRatio: 0.92,
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.sm,
      gap: 4,
    },
    badgeOn: { borderColor: c.accent },
    glyph: { fontSize: 26 },
    title: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  })
