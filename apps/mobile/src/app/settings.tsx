import { useMemo } from 'react'
import { Stack } from 'expo-router'
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
export default function SettingsScreen() {
  const styles = useStyles()
  const { c, mode, setMode } = useTheme()
  const { locale, setLocale } = useTranslation()
  const ka = locale === 'ka'

  return (
    <>
      <Stack.Screen options={{ title: ka ? 'პარამეტრები' : 'Settings' }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
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
    segmentText: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    segmentTextActive: { color: c.bg },
  })
