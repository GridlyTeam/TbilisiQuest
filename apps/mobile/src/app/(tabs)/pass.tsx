import { useCallback, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import { useTheme, radius, space, font, type Palette } from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Level = {
  level: number
  min_xp: number
  is_premium: boolean
  reward_type: string
  reward_code: string | null
  title_ka: string
  title_en: string
  unlocked: boolean
  claimed: boolean
}

type Pass = {
  season_code: string
  name_ka: string
  name_en: string
  starts_at: string
  ends_at: string
  xp: number
  level: number
  max_level: number
  level_min_xp: number
  next_min_xp: number | null
  has_premium: boolean
  levels: Level[] | null
}

/** Width of one level column, plus the gap. Used to scroll the current one in. */
const COLUMN = 92

/**
 * The City Pass.
 *
 * Two tracks over one ladder, read left to right: the free row is what
 * everyone climbs, the premium row above it is what a partner perk opens. The
 * track scrolls itself to the level you are on, because the only levels worth
 * looking at are the one you just took and the one in front of you.
 *
 * A level is not paid out by reaching it. Reaching it unlocks the button, and
 * the button is what grants -- so a reward is something you took, and the
 * server has a receipt saying so.
 */
export default function PassScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [pass, setPass] = useState<Pass | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const track = useRef<ScrollView>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_city_pass')
    const row = Array.isArray(data) ? data[0] : data
    setPass((row as Pass) ?? null)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const claim = useCallback(
    async (level: number, premium: boolean) => {
      const key = `${level}-${premium}`
      setBusy(key)
      setError(null)
      const { error: rpcError } = await supabase.rpc('claim_pass_reward', {
        p_level: level,
        p_premium: premium,
      })
      setBusy(null)

      if (rpcError) {
        // The server names every refusal; anything unnamed is a real fault and
        // should not be dressed up as a game rule.
        const code = rpcError.message.includes('PREMIUM_REQUIRED')
          ? ka
            ? 'ეს ჯილდო პრემიუმ ბილეთისთვისაა'
            : 'That reward is on the premium track'
          : rpcError.message.includes('LEVEL_LOCKED')
            ? ka
              ? 'ჯერ ეს დონე უნდა გახსნა'
              : 'That level is still locked'
            : rpcError.message.includes('ALREADY_CLAIMED')
              ? ka
                ? 'უკვე აღებულია'
                : 'Already taken'
              : ka
                ? 'ვერ მოხერხდა. სცადე ხელახლა.'
                : 'That did not work. Try again.'
        setError(code)
        return
      }

      await load()
    },
    [ka, load],
  )

  // Both tracks come back in one list; the screen wants them as columns.
  const columns = useMemo(() => {
    const rows = pass?.levels ?? []
    const byLevel = new Map<number, { free?: Level; premium?: Level }>()
    for (const row of rows) {
      const cell = byLevel.get(row.level) ?? {}
      if (row.is_premium) cell.premium = row
      else cell.free = row
      byLevel.set(row.level, cell)
    }
    return [...byLevel.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, cell]) => ({ level, ...cell }))
  }, [pass])

  const progress = useMemo(() => {
    if (!pass) return 0
    const floor = pass.level_min_xp
    const ceiling = pass.next_min_xp ?? pass.xp
    if (ceiling <= floor) return 1
    return Math.max(0, Math.min(1, (pass.xp - floor) / (ceiling - floor)))
  }, [pass])

  const daysLeft = useMemo(() => {
    if (!pass) return 0
    const ms = new Date(pass.ends_at).getTime() - Date.now()
    return Math.max(0, Math.ceil(ms / 86400000))
  }, [pass])

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  if (!pass) {
    return (
      <View style={styles.centre}>
        <Text style={styles.empty}>
          {ka
            ? 'სეზონი ჯერ არ დაწყებულა. მალე დაიწყება.'
            : 'No season is running yet. One starts soon.'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>
        {ka ? 'ქალაქის ბილეთი' : 'City Pass'}
      </Text>
      <Text style={styles.season}>{ka ? pass.name_ka : pass.name_en}</Text>
      <Text style={styles.countdown}>
        {ka ? `დარჩა ${daysLeft} დღე` : `${daysLeft} days left`}
      </Text>

      <View style={styles.levelCard}>
        <View style={styles.levelRow}>
          <Text style={styles.levelNumber}>{pass.level}</Text>
          <View style={styles.levelMeta}>
            <Text style={styles.levelLabel}>
              {ka ? 'დონე' : 'Level'} · {pass.max_level}
              {ka ? '-დან' : ' max'}
            </Text>
            <Text style={styles.xp}>
              {pass.next_min_xp == null
                ? ka
                  ? `${pass.xp} XP - ბოლო დონე`
                  : `${pass.xp} XP - top level`
                : ka
                  ? `${pass.xp} / ${pass.next_min_xp} XP`
                  : `${pass.xp} / ${pass.next_min_xp} XP`}
            </Text>
          </View>
        </View>

        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>

        {!pass.has_premium && (
          <Text style={styles.premiumHint}>
            {ka
              ? 'პრემიუმ ბილეთი პარტნიორ ადგილებში იხსნება'
              : 'The premium track opens through a partner venue'}
          </Text>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView
        ref={track}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.track}
        // Puts the level you are on a little in from the left edge, so the
        // one behind you stays visible as context.
        contentOffset={{ x: Math.max(0, (pass.level - 2) * COLUMN), y: 0 }}
      >
        {columns.map((column) => (
          <View key={column.level} style={styles.column}>
            <Cell
              row={column.premium}
              level={column.level}
              premium
              locked={!pass.has_premium}
              busy={busy === `${column.level}-true`}
              onClaim={() => claim(column.level, true)}
              ka={ka}
            />

            <View
              style={[
                styles.rung,
                column.level <= pass.level && styles.rungReached,
              ]}
            >
              <Text
                style={[
                  styles.rungText,
                  column.level <= pass.level && styles.rungTextReached,
                ]}
              >
                {column.level}
              </Text>
            </View>

            <Cell
              row={column.free}
              level={column.level}
              premium={false}
              locked={false}
              busy={busy === `${column.level}-false`}
              onClaim={() => claim(column.level, false)}
              ka={ka}
            />
          </View>
        ))}
      </ScrollView>

      <Text style={styles.footnote}>
        {ka
          ? 'XP მოდის ვაუჩერებიდან, დავალებებიდან და სერიიდან. ჯილდო თვითონ უნდა აიღო.'
          : 'XP comes from vouchers, quests and your streak. Rewards are taken, not given.'}
      </Text>
    </ScrollView>
  )
}

/**
 * One reward on one track.
 *
 * Four states, and they have to be told apart at a glance in a row of fifty:
 * empty (this level gives nothing on this track), locked, ready, taken.
 */
function Cell({
  row,
  level,
  premium,
  locked,
  busy,
  onClaim,
  ka,
}: {
  row?: Level
  level: number
  premium: boolean
  locked: boolean
  busy: boolean
  onClaim: () => void
  ka: boolean
}) {
  const styles = useStyles()
  const { c } = useTheme()

  if (!row || row.reward_type === 'nothing' || !row.reward_code) {
    return <View style={[styles.cell, styles.cellEmpty]} />
  }

  const ready = row.unlocked && !row.claimed && !locked

  return (
    <Pressable
      disabled={!ready || busy}
      onPress={onClaim}
      style={[
        styles.cell,
        premium && styles.cellPremium,
        row.claimed && styles.cellClaimed,
        ready && styles.cellReady,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={c.bg} />
      ) : (
        <>
          <Text
            style={[styles.cellTitle, ready && styles.cellTitleReady]}
            numberOfLines={2}
          >
            {ka ? row.title_ka : row.title_en}
          </Text>
          <Text style={[styles.cellState, ready && styles.cellStateReady]}>
            {row.claimed
              ? ka
                ? 'აღებული'
                : 'Taken'
              : locked
                ? ka
                  ? 'პრემიუმ'
                  : 'Premium'
                : row.unlocked
                  ? ka
                    ? 'აიღე'
                    : 'Take it'
                  : ka
                    ? `${row.min_xp} XP`
                    : `${row.min_xp} XP`}
          </Text>
        </>
      )}
    </Pressable>
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
      padding: space.xl,
    },
    empty: { color: c.textMuted, fontSize: 14, textAlign: 'center' },

    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    season: {
      color: c.text,
      fontSize: 26,
      fontWeight: '900',
      letterSpacing: 0,
      marginTop: space.xs,
    },
    countdown: { color: c.textMuted, fontSize: 13, marginTop: 2 },

    levelCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
      marginTop: space.lg,
    },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    levelNumber: {
      color: c.accent,
      fontSize: 46,
      fontWeight: '900',
      letterSpacing: 0,
    },
    levelMeta: { flex: 1 },
    levelLabel: { color: c.textFaint, fontSize: 12, fontWeight: '800' },
    xp: { color: c.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
    bar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.border,
      overflow: 'hidden',
      marginTop: space.md,
    },
    barFill: { height: '100%', backgroundColor: c.accent },
    premiumHint: { color: c.textFaint, fontSize: 12, marginTop: space.sm },

    error: { color: c.bad, fontSize: 13, marginTop: space.md },

    track: { paddingVertical: space.lg, gap: 8 },
    column: { width: COLUMN - 8, gap: 6 },

    // The ladder between the two tracks: the number, and how far you have come.
    rung: {
      height: 22,
      borderRadius: 11,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rungReached: { backgroundColor: c.accent, borderColor: c.accent },
    rungText: { color: c.textFaint, fontSize: 11, fontWeight: '900' },
    rungTextReached: { color: c.bg },

    cell: {
      height: 78,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 8,
      justifyContent: 'space-between',
    },
    // A level that gives nothing on this track is a gap in the row, not a card
    // with nothing written on it.
    cellEmpty: {
      backgroundColor: 'transparent',
      borderStyle: 'dashed',
      borderColor: c.border,
    },
    cellPremium: { borderColor: c.indigo },
    cellClaimed: { opacity: 0.55 },
    cellReady: { backgroundColor: c.accent, borderColor: c.accent },

    cellTitle: { color: c.text, fontSize: 12, fontWeight: '800' },
    cellTitleReady: { color: c.bg },
    cellState: { color: c.textFaint, fontSize: 10, fontWeight: '800' },
    cellStateReady: { color: c.bg },

    footnote: {
      color: c.textFaint,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space.md,
    },
  })
