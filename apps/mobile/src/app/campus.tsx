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

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, font, type Palette } from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Row = {
  code: string
  name_ka: string
  name_en: string
  colour: string | null
  players: number
  redemptions: number
  xp: number
}

type Standing = {
  code: string
  name_ka: string
  name_en: string
  colour: string | null
  campus_rank: number
  my_redemptions: number
  campus_redemptions: number
}

type University = { code: string; name_ka: string; name_en: string }

/**
 * The campus table.
 *
 * Ranked on redemptions rather than claims, because a claim is a tap and a
 * redemption is somebody who walked in and stood at a counter -- the number the
 * venues are paying for, and the only one worth arguing over.
 *
 * Choosing a campus is unverified and deliberately so: asking a sixteen year
 * old to prove where they study to join a leaderboard is a lot of friction for
 * a bragging right, and nothing here grants any privilege.
 */
export default function CampusScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [board, setBoard] = useState<Row[]>([])
  const [mine, setMine] = useState<Standing | null>(null)
  const [options, setOptions] = useState<University[]>([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)

  const load = useCallback(async () => {
    const [boardRes, mineRes, listRes] = await Promise.all([
      supabase.rpc('campus_leaderboard', { p_days: 30 }),
      supabase.rpc('my_campus_standing', { p_days: 30 }),
      supabase
        .from('universities')
        .select('code, name_ka, name_en')
        .eq('is_active', true),
    ])

    setBoard((boardRes.data as Row[]) ?? [])
    const row = (Array.isArray(mineRes.data) ? mineRes.data[0] : mineRes.data) as
      | Standing
      | undefined
    setMine(row ?? null)
    setOptions((listRes.data as University[]) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const choose = useCallback(
    async (code: string | null) => {
      setPicking(false)
      await supabase.rpc('set_my_university', { p_code: code })
      await load()
    },
    [load],
  )

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  const leader = board[0]

  return (
    <>
      <Stack.Screen options={{ title: ka ? 'კამპუსები' : 'Campuses' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {mine ? (
          <View
            style={[
              styles.mineCard,
              { borderColor: mine.colour ?? c.border },
            ]}
          >
            <Text style={styles.eyebrow}>
              {ka ? 'შენი კამპუსი' : 'Your campus'}
            </Text>
            <Text style={styles.mineName}>
              {ka ? mine.name_ka : mine.name_en}
            </Text>
            <Text style={styles.mineRank}>
              {ka
                ? `${mine.campus_rank} ადგილი - ${mine.campus_redemptions} გამოყენება`
                : `Rank ${mine.campus_rank} - ${mine.campus_redemptions} redemptions`}
            </Text>
            <Text style={styles.mineOwn}>
              {ka
                ? `აქედან შენი: ${mine.my_redemptions}`
                : `Your share: ${mine.my_redemptions}`}
            </Text>
            <Pressable onPress={() => setPicking(true)}>
              <Text style={styles.change}>
                {ka ? 'კამპუსის შეცვლა' : 'Change campus'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.mineCard}>
            <Text style={styles.eyebrow}>
              {ka ? 'აირჩიე მხარე' : 'Pick a side'}
            </Text>
            <Text style={styles.prompt}>
              {ka
                ? 'აირჩიე კამპუსი და შენი ყოველი გამოყენება მას ჩაეთვლება.'
                : 'Choose a campus and every redemption you make counts for it.'}
            </Text>
            <Pressable style={styles.primary} onPress={() => setPicking(true)}>
              <Text style={styles.primaryText}>
                {ka ? 'აირჩიე კამპუსი' : 'Choose campus'}
              </Text>
            </Pressable>
          </View>
        )}

        {picking && (
          <View style={styles.picker}>
            {options.map((option) => (
              <Pressable
                key={option.code}
                style={styles.option}
                onPress={() => choose(option.code)}
              >
                <Text style={styles.optionText}>
                  {ka ? option.name_ka : option.name_en}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.option} onPress={() => choose(null)}>
              <Text style={styles.optionMuted}>
                {ka ? 'არცერთი' : 'None of these'}
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          {ka ? 'ბოლო 30 დღე' : 'Last 30 days'}
        </Text>

        {board.map((row, index) => {
          // Every bar is read against the leader, so first place is always full
          // and the gap to it is the story.
          const share =
            leader && leader.redemptions > 0
              ? row.redemptions / leader.redemptions
              : 0
          const isMine = mine?.code === row.code

          return (
            <View
              key={row.code}
              style={[styles.row, isMine && styles.rowMine]}
            >
              <Text style={styles.rank}>{index + 1}</Text>

              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {ka ? row.name_ka : row.name_en}
                  </Text>
                  <Text style={styles.rowCount}>{row.redemptions}</Text>
                </View>

                <View style={styles.bar}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(share * 100, row.redemptions > 0 ? 6 : 0)}%`,
                        backgroundColor: row.colour ?? c.accent,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.rowMeta}>
                  {ka
                    ? `${row.players} მოთამაშე - ${row.xp} XP`
                    : `${row.players} players - ${row.xp} XP`}
                </Text>
              </View>
            </View>
          )
        })}

        <Text style={styles.footnote}>
          {ka
            ? 'ითვლება ვაუჩერის რეალურად გამოყენება მაღაზიაში, და არა აღება.'
            : 'Counted when a voucher is actually used in a shop, not when it is claimed.'}
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

    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    mineCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
    },
    mineName: {
      color: c.text,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: 0,
      marginTop: space.xs,
    },
    mineRank: { color: c.accent, fontSize: 14, fontWeight: '800', marginTop: 2 },
    mineOwn: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    change: { color: c.textFaint, fontSize: 12, fontWeight: '800', marginTop: space.md },
    prompt: { color: c.textMuted, fontSize: 14, lineHeight: 20, marginTop: space.xs },

    primary: {
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: space.md,
    },
    primaryText: { color: c.bg, fontSize: 14, fontWeight: '900' },

    picker: {
      marginTop: space.sm,
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    option: {
      paddingVertical: 14,
      paddingHorizontal: space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    optionText: { color: c.text, fontSize: 15, fontWeight: '700' },
    optionMuted: { color: c.textFaint, fontSize: 15, fontWeight: '700' },

    sectionTitle: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
      marginTop: space.lg,
      marginBottom: space.sm,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.md,
      marginBottom: space.sm,
    },
    rowMine: { borderColor: c.accent },
    rank: { color: c.textFaint, fontSize: 18, fontWeight: '900', width: 22 },
    rowBody: { flex: 1 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    rowName: { color: c.text, fontSize: 15, fontWeight: '800', flex: 1 },
    rowCount: { color: c.text, fontSize: 15, fontWeight: '900' },
    bar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.border,
      overflow: 'hidden',
      marginTop: 6,
    },
    barFill: { height: '100%' },
    rowMeta: { color: c.textFaint, fontSize: 11, marginTop: 5 },

    footnote: { color: c.textFaint, fontSize: 12, marginTop: space.md, lineHeight: 18 },
  })
