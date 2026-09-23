import { useCallback, useState, useMemo } from 'react'
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
import { useTranslation, LOCALES } from '../../lib/i18n'
import InviteCard from '../../components/InviteCard'
import QuestBoard from '../../components/QuestBoard'
import SeasonCard from '../../components/SeasonCard'
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
type Threshold = { level: number; min_total_xp: number }

export default function ProfileScreen() {
  const styles = useStyles()
  const { c, mode, setMode } = useTheme()
  const { locale, setLocale } = useTranslation()
  const [xp, setXp] = useState<Xp | null>(null)
  const [thresholds, setThresholds] = useState<Threshold[]>([])
  const [redeemed, setRedeemed] = useState(0)
  const [loading, setLoading] = useState(true)

  const ka = locale === 'ka'

  const load = useCallback(async () => {
    const [xpRes, thrRes, redRes] = await Promise.all([
      supabase.from('user_xp').select('total_xp, level, current_streak_days').maybeSingle(),
      supabase.from('level_thresholds').select('level, min_total_xp').order('level'),
      supabase.from('redemptions').select('id', { count: 'exact', head: true }),
    ])

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

      <SeasonCard />

      <QuestBoard />

      <BadgeCase />

      <InviteCard />

      <View style={styles.row}>
        <Text style={styles.rowLabel}>{ka ? 'იერსახე' : 'Appearance'}</Text>
        <View style={styles.segmented}>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setMode(option)}
              style={[styles.segment, mode === option && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === option && styles.segmentTextActive,
                ]}
              >
                {option === 'system'
                  ? ka ? 'ავტო' : 'Auto'
                  : option === 'light'
                    ? ka ? 'ღია' : 'Light'
                    : ka ? 'მუქი' : 'Dark'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* A picker rather than a tap-to-flip row: with a toggle the label has to
          double as both the current language and the thing you get if you
          press it, which is ambiguous in either reading. Here the selected
          language is simply the highlighted one. */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{ka ? 'ენა' : 'Language'}</Text>
        <View style={styles.segmented}>
          {LOCALES.map((option) => (
            <Pressable
              key={option.code}
              onPress={() => setLocale(option.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: locale === option.code }}
              style={[
                styles.segment,
                locale === option.code && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  locale === option.code && styles.segmentTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={styles.row} onPress={() => supabase.auth.signOut()}>
        <Text style={[styles.rowLabel, { color: c.bad }]}>
          {ka ? 'გამოსვლა' : 'Sign out'}
        </Text>
      </Pressable>
    </ScrollView>
  )
}

/**
 * Monday to Sunday, the way a week is read here.
 *
 * It used to be a rolling seven days ending today, which put Thursday first on
 * a Thursday -- accurate about the streak and unreadable as a week.
 */
const WEEK_KA = ['ორ', 'სა', 'ოთ', 'ხუ', 'პა', 'შა', 'კვ']
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
    justifyContent: 'space-between',
    gap: 6,
    marginTop: space.md,
  },
  // Each day is a cell rather than a bare letter: a filled square reads as a
  // day that counted, which an underline never did.
  // Sized from its content rather than a fixed 28px square: the Georgian
  // labels are two letters wide and were touching the box on every side.
  weekCell: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekCellToday: {
    backgroundColor: c.accent,
  },
  weekDay: { color: c.textFaint, fontSize: 13, fontWeight: '700' },
  weekDayOn: { color: c.accentInk, fontWeight: '900' },
  weekDayToday: { color: c.bg, fontWeight: '900' },
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
  rowLabel: { color: c.text, fontSize: 15, fontWeight: '700' },
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
  segmentActive: { backgroundColor: c.accent },
  segmentText: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: c.bg },
})
