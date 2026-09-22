import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, font, type Palette } from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Tier = {
  tier: number
  min_xp: number
  title_ka: string
  title_en: string
  reward_code: string | null
  unlocked: boolean
}

type Season = {
  season_code: string
  name_ka: string
  name_en: string
  ends_at: string
  xp: number
  tier: number
  next_tier_xp: number | null
  tiers: Tier[] | null
}

/**
 * The season track.
 *
 * Levels never reset, which makes them a lifetime record and a poor reason to
 * play this month. A season resets everyone to zero and, more importantly,
 * ends -- the countdown is doing as much work here as the rewards.
 *
 * The track scrolls horizontally with the current tier in view, so the next
 * unlock is always the thing in front of you rather than something to hunt for
 * in a list.
 */
export default function SeasonCard() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'
  const [season, setSeason] = useState<Season | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_season')
    const row = Array.isArray(data) ? data[0] : data
    setSeason((row as Season) ?? null)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (!season) return null

  const tiers = season.tiers ?? []
  const floor =
    [...tiers].reverse().find((t) => t.unlocked)?.min_xp ?? 0
  const ceiling = season.next_tier_xp ?? Math.max(season.xp, floor + 1)
  const ratio = Math.min(
    1,
    Math.max(0, (season.xp - floor) / Math.max(1, ceiling - floor)),
  )

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(season.ends_at).getTime() - Date.now()) / 86_400_000),
  )

  return (
    <View style={styles.root}>
      {/* Stacked rather than side by side: the Georgian season name and
          "დარჩა 42 დღე" together are wider than a phone, and sharing a row
          meant the title shrank to make space for the countdown. The name
          gets the full width; the countdown sits under it. */}
      <View style={styles.head}>
        <Text style={styles.name}>{ka ? season.name_ka : season.name_en}</Text>
        <Text style={styles.days}>
          {ka ? `დარჩა ${daysLeft} დღე` : `${daysLeft} days left`}
        </Text>
      </View>

      <Text style={styles.tierNow}>
        {ka ? 'საფეხური' : 'Tier'} {season.tier}
        <Text style={styles.xp}>
          {'  '}
          {season.xp}
          {season.next_tier_xp != null ? ` / ${season.next_tier_xp}` : ''} XP
        </Text>
      </Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tiers}
      >
        {tiers.map((tier) => (
          <View
            key={tier.tier}
            style={[styles.tier, tier.unlocked && styles.tierOn]}
          >
            <Text
              style={[
                styles.tierNum,
                { color: tier.unlocked ? c.bg : c.textFaint },
              ]}
            >
              {tier.tier}
            </Text>
            <Text
              style={[
                styles.tierTitle,
                { color: tier.unlocked ? c.bg : c.textMuted },
              ]}
              numberOfLines={1}
            >
              {ka ? tier.title_ka : tier.title_en}
            </Text>
            <Text
              style={[
                styles.tierXp,
                { color: tier.unlocked ? c.bg : c.textFaint },
              ]}
            >
              {tier.min_xp}
            </Text>
          </View>
        ))}
      </ScrollView>
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
      gap: space.sm,
    },
    head: { gap: 3 },
    name: {
      color: c.text,
      fontSize: font.heading.fontSize,
      fontWeight: font.heading.fontWeight,
      letterSpacing: 0,
    },
    days: { color: c.accent, fontSize: 12, fontWeight: '700' },
    tierNow: { color: c.text, fontSize: 14, fontWeight: '700' },
    xp: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    track: {
      height: 8,
      backgroundColor: c.bg,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    fill: { height: '100%', backgroundColor: c.accent },
    tiers: { gap: space.sm, paddingTop: space.xs },
    tier: {
      width: 92,
      backgroundColor: c.bg,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.sm,
      gap: 1,
    },
    tierOn: { backgroundColor: c.accent, borderColor: c.accent },
    tierNum: { fontSize: 11, fontWeight: '800', letterSpacing: 0 },
    tierTitle: { fontSize: 13, fontWeight: '700' },
    tierXp: { fontSize: 11, fontWeight: '600' },
  })
