import { useCallback, useMemo, useState } from 'react'
import { Stack, useFocusEffect } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation, LOCALES } from '../lib/i18n'
import { useTheme, radius, space, type Palette } from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

/**
 * Settings.
 *
 * These used to sit at the bottom of the profile tab, which meant a quarter of
 * the tab bar was spent on things a player touches a handful of times ever.
 * They live behind a header button now; the fourth tab is worth more as the
 * season.
 */
type Visibility = 'ghost' | 'squad' | 'public'

const MODES: Array<{ mode: Visibility; ka: string; en: string; hintKa: string; hintEn: string }> = [
  {
    mode: 'ghost',
    ka: 'აჩრდილი',
    en: 'Ghost',
    hintKa: 'რუკაზე მხოლოდ შენ ხედავ საკუთარ თავს',
    hintEn: 'Nobody sees you on the map',
  },
  {
    mode: 'squad',
    ka: 'ჯგუფი',
    en: 'Squad',
    hintKa: 'გხედავენ მხოლოდ ისინი, ვისთანაც ერთად ჩაირთვე დროფზე',
    hintEn: 'Only people you just checked into a drop with',
  },
  {
    mode: 'public',
    ka: 'ღია',
    en: 'Public',
    hintKa: 'გხედავენ ახლომდებარე მოთამაშეები, მაგრამ ზუსტი ადგილი არასოდეს ჩანს',
    hintEn: 'Nearby players see you, never your exact spot',
  },
]

export default function SettingsScreen() {
  const styles = useStyles()
  const { c, mode, setMode } = useTheme()
  const { locale, setLocale } = useTranslation()
  const ka = locale === 'ka'

  const [visibility, setVisibility] = useState<Visibility>('ghost')
  const [ageLocked, setAgeLocked] = useState(true)

  const loadVisibility = useCallback(async () => {
    const { data } = await supabase.rpc('my_visibility')
    const row = (Array.isArray(data) ? data[0] : data) as
      | { mode: Visibility; age_locked: boolean }
      | undefined
    if (row) {
      setVisibility(row.mode)
      setAgeLocked(row.age_locked)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadVisibility()
    }, [loadVisibility]),
  )

  const chooseVisibility = useCallback(
    async (next: Visibility) => {
      const previous = visibility
      setVisibility(next)
      const { error } = await supabase.rpc('set_visibility', { p_mode: next })
      if (error) setVisibility(previous)
    },
    [visibility],
  )

  const active = MODES.find((m) => m.mode === visibility) ?? MODES[0]

  return (
    <>
      <Stack.Screen options={{ title: ka ? 'პარამეტრები' : 'Settings' }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {/* First, because it is the only setting here that changes what other
            people can do. Under 16 the choice is not offered at all -- the
            control is shown disabled with the reason, rather than hidden, so
            nobody wonders where it went. */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>
            {ka ? 'ვინ გხედავს რუკაზე' : 'Who sees you on the map'}
          </Text>
          <View style={styles.segmented}>
            {MODES.map((option) => (
              <Pressable
                key={option.mode}
                disabled={ageLocked && option.mode !== 'ghost'}
                onPress={() => chooseVisibility(option.mode)}
                style={[
                  styles.segment,
                  visibility === option.mode && styles.segmentActive,
                  ageLocked && option.mode !== 'ghost' && styles.segmentLocked,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    visibility === option.mode && styles.segmentTextActive,
                  ]}
                >
                  {ka ? option.ka : option.en}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {ageLocked
              ? ka
                ? '16 წლამდე მხოლოდ აჩრდილის რეჟიმია - ეს არ იცვლება.'
                : 'Under 16 it is ghost only, and that does not change.'
              : ka
                ? active.hintKa
                : active.hintEn}
          </Text>
        </View>

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

        {/* A picker rather than a tap-to-flip row: with a toggle the label has
            to double as both the current language and the thing you get if you
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
    </>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: space.lg, gap: space.md },
    row: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.md,
      gap: space.sm,
    },
    rowLabel: { color: c.text, fontSize: 15, fontWeight: '700' },
    segmented: {
      flexDirection: 'row',
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.pill,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: radius.pill,
      alignItems: 'center',
    },
    segmentActive: { backgroundColor: c.accent },
    segmentLocked: { opacity: 0.4 },
    hint: { color: c.textFaint, fontSize: 12, lineHeight: 17 },
    segmentText: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    segmentTextActive: { color: c.bg },
  })
