import { useCallback, useState, useMemo } from 'react'
import { Stack, useFocusEffect, useRouter } from 'expo-router'
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
import InviteCard from '../../components/InviteCard'
import QuestBoard from '../../components/QuestBoard'
import CityPass from '../../components/CityPass'
import BadgeCase from '../../components/BadgeCase'
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


type Xp = { total_xp: number; level: number; current_streak_days: number }
type BoardRow = { rank: number; display_name: string; xp: number; is_me: boolean }
type Standing = { rank: number; xp: number; players: number }
type Threshold = { level: number; min_total_xp: number }

export default function SeasonScreen() {
  const styles = useStyles()
  const router = useRouter()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const [xp, setXp] = useState<Xp | null>(null)
  const [thresholds, setThresholds] = useState<Threshold[]>([])
  const [redeemed, setRedeemed] = useState(0)
  const [board, setBoard] = useState<BoardRow[]>([])
  const [standing, setStanding] = useState<Standing | null>(null)
  const [loading, setLoading] = useState(true)

  const ka = locale === 'ka'

  const load = useCallback(async () => {
    const [xpRes, thrRes, redRes, boardRes, standingRes] = await Promise.all([
      supabase.from('user_xp').select('total_xp, level, current_streak_days').maybeSingle(),
      supabase.from('level_thresholds').select('level, min_total_xp').order('level'),
      supabase.from('redemptions').select('id', { count: 'exact', head: true }),
      supabase.rpc('season_leaderboard', { p_limit: 10 }),
      supabase.rpc('my_season_rank'),
    ])

    setBoard((boardRes.data as BoardRow[]) ?? [])
    const standingRow = (
      Array.isArray(standingRes.data) ? standingRes.data[0] : standingRes.data
    ) as Standing | undefined
    setStanding(standingRow ?? null)

    setXp((xpRes.data as Xp | null) ?? { total_xp: 0, level: 1, current_streak_days: 0 })
    setThresholds((thrRes.data ?? []) as Threshold[])
    setRedeemed(redRes.count ?? 0)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (loading || !xp) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  const current = thresholds.find((t) => t.level === xp.level)
  const next = thresholds.find((t) => t.level === xp.level + 1)
  const floor = current?.min_total_xp ?? 0
  const ceiling = next?.min_total_xp ?? floor + 1
  const progress = Math.min(1, Math.max(0, (xp.total_xp - floor) / (ceiling - floor)))

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Settings are not a tab any more: they are visited a handful of times
          ever, and the fourth tab is worth more as the season. */}
      <Stack.Screen
        options={{
          title: ka ? 'სეზონი' : 'Season',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityLabel={ka ? 'პარამეტრები' : 'Settings'}
              style={styles.gear}
            >
              <Text style={styles.gearText}>{ka ? 'პარამეტრები' : 'Settings'}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.levelCard}>
        <Text style={styles.levelLabel}>{ka ? 'დონე' : 'Level'}</Text>
        <Text style={styles.levelValue}>{xp.level}</Text>

        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>

        <Text style={styles.xpText}>
          {next
            ? ka
              ? `${xp.total_xp} / ${ceiling} XP`
              : `${xp.total_xp} / ${ceiling} XP`
            : `${xp.total_xp} XP`}
        </Text>
      </View>

      {/* The week, with the days this streak covers filled in. Straight from
          the dashboard design -- a number alone says less than seven dots
          with a gap in them. */}
      <View style={styles.streakCard}>
        <Text style={styles.streakLabel}>{ka ? 'შენი სერია' : 'Your streak'}</Text>
        <Text style={styles.streakNumber}>
          {String(xp.current_streak_days).padStart(2, '0')}
          <Text style={styles.streakUnit}>{ka ? ' დღე' : ' days'}</Text>
        </Text>

        <View style={styles.week}>
          {(ka ? WEEK_KA : WEEK_EN).map((day, index) => {
            const today = mondayIndex(new Date())
            // Fill backwards from today for as long as the streak runs, and
            // never mark a day that has not happened yet this week.
            const covered =
              index <= today && today - index < xp.current_streak_days
            const isToday = index === today
            return (
              // Only today wears the box; it moves along the row as the week
              // does. The rest are plain letters, amber where the streak has
              // reached them.
              <View
                key={`${day}-${index}`}
                style={[styles.weekCell, isToday && styles.weekCellToday]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.weekDay,
                    covered && styles.weekDayOn,
                    isToday && styles.weekDayToday,
                  ]}
                >
                  {day}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{redeemed}</Text>
          <Text style={styles.statLabel} numberOfLines={2}>
            {ka ? 'გამოყენებული' : 'Redeemed'}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {xp.current_streak_days > 0 ? '🔥 ' : ''}
            {xp.current_streak_days}
          </Text>
          <Text style={styles.statLabel} numberOfLines={2}>
            {ka ? 'დღიური სერია' : 'Day streak'}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{xp.total_xp}</Text>
          <Text style={styles.statLabel} numberOfLines={2}>
            {ka ? 'სულ XP' : 'Total XP'}
          </Text>
        </View>
      </View>

      {/* The board itself rather than a door to it: a rank you have to go
          looking for is a rank nobody looks at. The top three, where you
          stand, and a way through to the rest. */}
      <View style={styles.boardCard}>
        <View style={styles.boardHead}>
          <Text style={styles.boardTitle}>
            {ka ? 'სეზონის ლიდერები' : 'Season leaders'}
          </Text>
          <Pressable onPress={() => router.push('/leaderboard')}>
            <Text style={styles.boardMore}>{ka ? 'ყველა' : 'See all'}</Text>
          </Pressable>
        </View>

        {board.length === 0 ? (
          <Text style={styles.boardEmpty}>
            {ka
              ? 'ჯერ არავის აქვს XP ამ სეზონზე.'
              : 'Nobody has XP this season yet.'}
          </Text>
        ) : (
          board.slice(0, 3).map((row) => (
            <View key={`${row.rank}-${row.display_name}`} style={styles.boardRow}>
              <Text
                style={[
                  styles.boardRank,
                  row.rank === 1 && { color: c.accent },
                  row.rank === 3 && { color: c.indigo },
                ]}
              >
                {row.rank}
              </Text>
              <Text style={styles.boardName} numberOfLines={1}>
                {row.display_name}
              </Text>
              <Text style={styles.boardXp}>{row.xp}</Text>
            </View>
          ))
        )}

        {standing && standing.rank > 0 && (
          <Text style={styles.boardMine}>
            {ka
              ? `შენ - ${standing.rank} ადგილი ${standing.players}-დან`
              : `You are ${standing.rank} of ${standing.players}`}
          </Text>
        )}
      </View>

      <CityPass />

      <QuestBoard />

      <BadgeCase />

      <InviteCard />

    </ScrollView>
  )
}

/**
 * Monday to Sunday, the way a week is read here.
 *
 * It used to be a rolling seven days ending today, which put Thursday first on
 * a Thursday -- accurate about the streak and unreadable as a week.
 */
const WEEK_KA = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვ']
const WEEK_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Monday is 0, Sunday is 6 -- getDay() puts Sunday first, which we do not. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  content: { padding: space.lg, gap: space.md },
  centered: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelCard: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.xl,
    alignItems: 'center',
  },
  levelLabel: {
    color: c.textFaint,
    fontSize: font.eyebrow.fontSize,
    fontWeight: font.eyebrow.fontWeight,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  // The one genuinely large number in the app outside the claim moment.
  levelValue: {
    color: c.accent,
    fontSize: font.display.fontSize,
    fontWeight: font.display.fontWeight,
    letterSpacing: 0,
    lineHeight: font.display.fontSize + 6,
  },
  barTrack: {
    width: '100%',
    height: 8,
    backgroundColor: c.bg,
    borderRadius: radius.pill,
    marginTop: space.md,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: c.accent },
  xpText: { color: c.textMuted, fontSize: 13, marginTop: space.sm },
  streakCard: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.lg,
  },
  streakLabel: {
    color: c.textFaint,
    fontSize: font.eyebrow.fontSize,
    fontWeight: font.eyebrow.fontWeight,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  streakNumber: {
    color: c.accent,
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: space.sm,
  },
  streakUnit: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  week: {
    flexDirection: 'row',
    gap: 4,
    marginTop: space.md,
  },
  // Each day is a cell rather than a bare letter: a filled square reads as a
  // day that counted, which an underline never did.
  // An equal share of the row rather than a fixed square: the Georgian labels
  // are three letters wide, and seven fixed cells wide enough for them would
  // run past the edge of the card.
  weekCell: {
    flex: 1,
    height: 32,
    paddingHorizontal: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekCellToday: {
    backgroundColor: c.accent,
  },
  weekDay: { color: c.textFaint, fontSize: 11, fontWeight: '700' },
  weekDayOn: { color: c.accentInk, fontWeight: '900' },
  weekDayToday: { color: c.bg, fontWeight: '900' },
  link: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.md,
  },
  linkTitle: { color: c.text, fontSize: 14, fontWeight: '800' },
  linkHint: { color: c.textFaint, fontSize: 11, marginTop: 3 },
  boardCard: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.md,
    gap: 6,
  },
  boardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  boardTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
  boardMore: { color: c.accent, fontSize: 12, fontWeight: '800' },
  boardEmpty: { color: c.textMuted, fontSize: 13 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  boardRank: {
    color: c.textFaint,
    fontSize: 14,
    fontWeight: '900',
    width: 20,
    textAlign: 'right',
  },
  boardName: { color: c.text, fontSize: 14, fontWeight: '700', flex: 1 },
  boardXp: { color: c.text, fontSize: 14, fontWeight: '900' },
  boardMine: { color: c.textFaint, fontSize: 12, marginTop: 4 },
  gear: { paddingHorizontal: space.md },
  gearText: { color: c.accent, fontSize: 13, fontWeight: '800' },

  statRow: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.md,
    alignItems: 'center',
  },
  statValue: {
    color: c.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  statLabel: {
    color: c.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginTop: 3,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.lg,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: c.bg,
    borderRadius: radius.sm,
    padding: 2,
    gap: 2,
  },
  segment: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.sm - 2,
  },
})
