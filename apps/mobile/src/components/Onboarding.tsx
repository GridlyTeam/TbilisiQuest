import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, font, type Palette } from '../lib/theme'
import Creature, { CREATURE_COLOURS } from './Creature'
import Stage from './Stage'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

const COLOURS = Object.keys(CREATURE_COLOURS)

/**
 * The first thing after the birth date: meet your creature.
 *
 * Two choices and nothing else -- a name and a colour. Everything else in the
 * app is earned, and a sign-up that asks for more than this is a sign-up people
 * abandon halfway.
 *
 * It appears after the age gate rather than beside it, because a player who has
 * not said how old they are cannot be shown a screen that implies they are in.
 */
export default function Onboarding() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [needed, setNeeded] = useState(false)
  const [name, setName] = useState('')
  const [colour, setColour] = useState(COLOURS[4] ?? 'cyan')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('users')
        .select('display_name, avatar_config, birth_date')
        .maybeSingle()

      if (!data) return
      const config = (data.avatar_config ?? {}) as Record<string, string>
      // Only once the age gate is satisfied, and only until a colour is
      // chosen: the colour is the thing that proves this screen was seen.
      setNeeded(data.birth_date != null && !config.colour)
      if (data.display_name) setName(data.display_name)
    })()
  }, [])

  const save = useCallback(async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError(ka ? 'სახელი მოკლეა' : 'That name is too short')
      return
    }

    setBusy(true)
    setError(null)

    // RLS already scopes the update to auth.uid(); the point of fetching the
    // user here is only to fail loudly if the session has gone stale, rather
    // than silently matching zero rows the way an unguarded .eq() would.
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setBusy(false)
      setError(ka ? 'თავიდან შედი და სცადე' : 'Please sign in again and retry')
      return
    }

    const { data: row } = await supabase
      .from('users')
      .select('avatar_config')
      .eq('id', auth.user.id)
      .maybeSingle()
    const config = (row?.avatar_config ?? {}) as Record<string, string>

    const { error: nameError } = await supabase
      .from('users')
      .update({ display_name: trimmed })
      .eq('id', auth.user.id)

    const { error: configError } = await supabase.rpc('set_avatar_config', {
      p_config: { ...config, colour },
    })

    setBusy(false)

    if (nameError || configError) {
      setError(ka ? 'ვერ შეინახა. სცადე ხელახლა.' : 'That did not save. Try again.')
      return
    }

    setNeeded(false)
  }, [name, colour, ka])

  if (!needed) return null

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
      <View style={styles.root}>
        <Text style={styles.eyebrow}>{ka ? 'გაიცანი' : 'Meet'}</Text>
        <Text style={styles.title}>
          {ka ? 'შენი პერსონაჟი' : 'Your creature'}
        </Text>

        {/* Tinted by whichever colour is selected, so tapping a swatch
            changes the whole scene rather than just the creature. */}
        <Stage background={null} tint={colour} height={260} ka={ka}>
          <Creature colour={colour} size={190} />
        </Stage>

        <Text style={styles.label}>{ka ? 'ფერი' : 'Colour'}</Text>
        <View style={styles.swatches}>
          {COLOURS.map((key) => (
            <Pressable
              key={key}
              onPress={() => setColour(key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: colour === key }}
              style={[
                styles.swatch,
                { backgroundColor: CREATURE_COLOURS[key].body },
                colour === key && styles.swatchActive,
              ]}
            />
          ))}
        </View>

        <Text style={styles.label}>{ka ? 'სახელი' : 'Name'}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={ka ? 'როგორ დაგიძახონ?' : 'What should we call you?'}
          placeholderTextColor={c.textFaint}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {/* Said once, here, rather than buried in a policy: this name is the
            one other players see on the leaderboard and on the map. */}
        <Text style={styles.hint}>
          {ka
            ? 'ამ სახელს დაინახავენ სხვები. ნუ დაწერ ნამდვილ სახელს ან სკოლას.'
            : 'Other players see this name. Do not use your real name or your school.'}
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.primary, busy && styles.disabled]}
          onPress={save}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={c.bg} />
          ) : (
            <Text style={styles.primaryText}>
              {ka ? 'დაწყება' : 'Start playing'}
            </Text>
          )}
        </Pressable>
      </View>
    </Modal>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.bg,
      padding: space.lg,
      paddingTop: space.xl * 2,
      gap: space.sm,
    },
    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    title: {
      color: c.text,
      fontSize: 28,
      fontWeight: '900',
      letterSpacing: 0,
      marginBottom: space.sm,
    },
    label: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
      marginTop: space.md,
    },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: 'transparent',
    },
    swatchActive: { borderColor: c.text },
    input: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: space.md,
      paddingVertical: 12,
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
    },
    hint: { color: c.textFaint, fontSize: 12, lineHeight: 17 },
    error: { color: c.bad, fontSize: 13 },
    primary: {
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 'auto',
    },
    disabled: { opacity: 0.6 },
    primaryText: { color: c.bg, fontSize: 16, fontWeight: '900' },
  })
