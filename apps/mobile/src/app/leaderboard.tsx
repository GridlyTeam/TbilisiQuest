import { useCallback, useMemo, useState } from 'react'
import { Stack, useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
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
  rank: number
  display_name: string
  xp: number
  is_me: boolean
}

type Standing = { rank: number; xp: number; players: number }

/**
 * The season board.
 *
 * One board, and nobody joins it: XP comes from claiming and using vouchers, so
 * every active player is already ranked. The campus rivalry that used to live
 * here was removed before launch -- it asked for a choice before you could
 * compete, and a player who skipped the choice competed in nothing.
 *
 * It shows nicknames and numbers, and no way to reach the person behind either.
 */
export default function LeaderboardScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [rows, setRows] = useState<Row[]>([])
  const [mine, setMine] = useState<Standing | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [board, standing] = await Promise.all([
      supabase.rpc('season_leaderboard', { p_limit: 100 }),
      supabase.rpc('my_season_rank'),
    ])
    setRows((board.data as Row[]) ?? [])
    const row = (
      Array.isArray(standing.data) ? standing.data[0] : standing.data
    ) as Standing | undefined
    setMine(row ?? null)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  const leader = rows[0]
  // Whether the player is already somewhere in the visible list decides if the
  // standing card is a summary or the only place they appear.
  const inList = rows.some((r) => r.is_me)

  return (
    <>
      <Stack.Screen options={{ title: ka ? 'სეზონის ლიდერები' : 'Season leaders' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mineCard}>
          <Text style={styles.eyebrow}>{ka ? 'შენი ადგილი' : 'Your place'}</Text>
          {mine && mine.rank > 0 ? (
            <>
              <Text style={styles.mineRank}>
                {mine.rank}
                <Text style={styles.mineOf}>
                  {ka ? ` / ${mine.players}` : ` of ${mine.players}`}
                </Text>
              </Text>
              <Text style={styles.mineXp}>
                {mine.xp} XP
                {!inList &&
                  (ka
                    ? ' - პირველ ასეულში ჯერ არა'
                    : ' - not in the top 100 yet')}
              </Text>
            </>
          ) : (
            <Text style={styles.prompt}>
              {ka
                ? 'აიღე პირველი ვაუჩერი და სიაში მოხვდები.'
                : 'Claim your first voucher and you are on the board.'}
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>
          {ka ? 'სეზონის ტოპ 100' : 'Top 100 this season'}
        </Text>

        {rows.length === 0 ? (
          <Text style={styles.empty}>
            {ka
              ? 'ჯერ არავის აქვს XP ამ სეზონზე. პირველი შენ იყავი.'
              : 'Nobody has XP this season yet. Be first.'}
          </Text>
        ) : (
          rows.map((row, index) => {
            const share =
              leader && leader.xp > 0 ? row.xp / leader.xp : 0

            return (
              <View
                key={`${row.rank}-${row.display_name}-${index}`}
                style={[styles.row, row.is_me && styles.rowMine]}
              >
                <Text
                  style={[
                    styles.rank,
                    // The podium is the only place colour is spent, so the top
                    // three read as different without a medal graphic.
                    row.rank === 1 && { color: c.accent },
                    row.rank === 2 && { color: c.text },
                    row.rank === 3 && { color: c.indigo },
                  ]}
                >
                  {row.rank}
                </Text>

                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.display_name}
                    </Text>
                    <Text style={styles.rowXp}>{row.xp}</Text>
                  </View>
                  <View style={styles.bar}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.max(share * 100, 4)}%`,
                          backgroundColor: row.is_me ? c.accent : c.indigo,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            )
          })
        )}

        <Text style={styles.footnote}>
          {ka
            ? 'XP გროვდება ვაუჩერების აღებითა და გამოყენებით. სეზონის ბოლოს ლიდერები იღებენ პრიზებს.'
            : 'XP comes from claiming and using vouchers. The leaders take the prizes when the season ends.'}
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
    mineRank: {
      color: c.accent,
      fontSize: 42,
      fontWeight: '900',
      letterSpacing: 0,
      marginTop: space.xs,
    },
    mineOf: { color: c.textMuted, fontSize: 15, fontWeight: '800' },
    mineXp: { color: c.text, fontSize: 14, fontWeight: '700' },
    prompt: { color: c.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4 },

    sectionTitle: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    empty: { color: c.textMuted, fontSize: 14, lineHeight: 20 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      marginBottom: 6,
    },
    rowMine: { borderColor: c.accent },
    rank: {
      color: c.textFaint,
      fontSize: 16,
      fontWeight: '900',
      width: 28,
      textAlign: 'right',
    },
    rowBody: { flex: 1 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    rowName: { color: c.text, fontSize: 14, fontWeight: '800', flex: 1 },
    rowXp: { color: c.text, fontSize: 14, fontWeight: '900' },
    bar: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      overflow: 'hidden',
      marginTop: 5,
    },
    barFill: { height: '100%' },

    footnote: {
      color: c.textFaint,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space.md,
    },
  })
