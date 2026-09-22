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

type Quest = {
  quest_id: string
  code: string
  title_ka: string
  title_en: string
  description_ka: string | null
  description_en: string | null
  cadence: 'daily' | 'weekly' | 'special'
  target: number
  progress: number
  xp_reward: number
  completed: boolean
  period_ends: string | null
}

/**
 * The week's objectives.
 *
 * Kept to a handful on purpose: three quests a player can hold in their head
 * beat twelve they scroll past. Unfinished ones sort first, and a finished one
 * stays visible for the rest of its period rather than vanishing -- the point
 * of a completed quest is that you can see you completed it.
 *
 * Progress is written server-side by triggers on claims and redemptions, so
 * this only ever reads.
 */
export default function QuestBoard() {
  const styles = useStyles()
  const { locale } = useTranslation()
  const ka = locale === 'ka'
  const [quests, setQuests] = useState<Quest[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_quests')
    setQuests((data ?? []) as Quest[])
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (quests.length === 0) return null

  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>{ka ? 'დავალებები' : 'Quests'}</Text>

      {quests.map((quest) => (
        <QuestRow key={quest.quest_id} quest={quest} ka={ka} />
      ))}
    </View>
  )
}

function QuestRow({ quest, ka }: { quest: Quest; ka: boolean }) {
  const styles = useStyles()
  const { c } = useTheme()

  const ratio = Math.min(1, quest.progress / Math.max(1, quest.target))
  const title = ka ? quest.title_ka : quest.title_en
  const description = ka ? quest.description_ka : quest.description_en

  return (
    <View style={[styles.quest, quest.completed && styles.questDone]}>
      <View style={styles.questHead}>
        <Text style={styles.questTitle}>{title}</Text>
        <Text
          style={[
            styles.xp,
            { color: quest.completed ? c.good : c.accent },
          ]}
        >
          {quest.completed ? '✓ ' : '+'}
          {quest.xp_reward} XP
        </Text>
      </View>

      {description && <Text style={styles.questBody}>{description}</Text>}

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${ratio * 100}%`,
              backgroundColor: quest.completed ? c.good : c.accent,
            },
          ]}
        />
      </View>

      <View style={styles.questFoot}>
        <Text style={styles.count}>
          {quest.progress} / {quest.target}
        </Text>
        <Text style={styles.cadence}>
          {quest.cadence === 'daily'
            ? ka ? 'დღიური' : 'Daily'
            : quest.cadence === 'weekly'
              ? ka ? 'კვირის' : 'Weekly'
              : ka ? 'სპეციალური' : 'Special'}
          {quest.period_ends && !quest.completed
            ? ` · ${remaining(quest.period_ends, ka)}`
            : ''}
        </Text>
      </View>
    </View>
  )
}

/** "2 days left" / "6 hours left" -- whichever unit is still meaningful. */
function remaining(iso: string, ka: boolean): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return ka ? 'დასრულდა' : 'over'

  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 24) {
    const days = Math.round(hours / 24)
    return ka ? `დარჩა ${days} დღე` : `${days}d left`
  }
  return ka ? `დარჩა ${hours} სთ` : `${hours}h left`
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
    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: font.eyebrow.letterSpacing,
      textTransform: 'uppercase',
    },
    quest: { gap: 6 },
    questDone: { opacity: 0.65 },
    questHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
    },
    questTitle: { color: c.text, fontSize: 15, fontWeight: '700', flex: 1 },
    xp: { fontSize: 13, fontWeight: '800' },
    questBody: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    track: {
      height: 6,
      backgroundColor: c.bg,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: radius.pill },
    questFoot: { flexDirection: 'row', justifyContent: 'space-between' },
    count: { color: c.text, fontSize: 12, fontWeight: '700' },
    cadence: { color: c.textFaint, fontSize: 12 },
  })
