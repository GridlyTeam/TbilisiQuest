import { useCallback, useEffect, useState } from 'react'
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
import { colors, radius, space } from '../../lib/theme'

type Xp = { total_xp: number; level: number; current_streak_days: number }
type Threshold = { level: number; min_total_xp: number }

export default function ProfileScreen() {
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

  useEffect(() => {
    void load()
  }, [load])

  if (loading || !xp) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
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

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{redeemed}</Text>
          <Text style={styles.statLabel}>{ka ? 'გამოყენებული' : 'Redeemed'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{xp.current_streak_days}</Text>
          <Text style={styles.statLabel}>{ka ? 'დღიური სერია' : 'Day streak'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{xp.total_xp}</Text>
          <Text style={styles.statLabel}>{ka ? 'სულ XP' : 'Total XP'}</Text>
        </View>
      </View>

      <Pressable style={styles.row} onPress={() => setLocale(ka ? 'en' : 'ka')}>
        <Text style={styles.rowLabel}>{ka ? 'ენა' : 'Language'}</Text>
        <Text style={styles.rowValue}>{ka ? 'ქართული' : 'English'}</Text>
      </Pressable>

      <Pressable style={styles.row} onPress={() => supabase.auth.signOut()}>
        <Text style={[styles.rowLabel, { color: colors.bad }]}>
          {ka ? 'გამოსვლა' : 'Sign out'}
        </Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    alignItems: 'center',
  },
  levelLabel: {
    color: colors.textFaint,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  levelValue: { color: colors.accent, fontSize: 56, fontWeight: '800' },
  barTrack: {
    width: '100%',
    height: 8,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    marginTop: space.md,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.accent },
  xpText: { color: colors.textMuted, fontSize: 13, marginTop: space.sm },
  statRow: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  statLabel: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowValue: { color: colors.textMuted, fontSize: 15 },
})
