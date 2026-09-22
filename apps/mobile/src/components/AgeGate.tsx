import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, font, type Palette } from '../lib/theme'

/** Digits only, capped -- a date field should not accept letters at all. */
function digits(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max)
}

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

/**
 * Asked once, before anything else, and never again.
 *
 * A date rather than a tick-box: "I am over 13" collects nothing useful, and
 * the difference between a 14-year-old and a 17-year-old decides what they are
 * allowed to do here. The date is write-once in the database, so this screen
 * cannot be revisited to become older later -- which is the whole point.
 *
 * Under 16 has to confirm a parent or guardian knows. That is an
 * acknowledgement, not verified consent; no app this size can verify a parent,
 * and the copy says what it is rather than pretending otherwise.
 */
export default function AgeGate() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [needed, setNeeded] = useState(false)
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void supabase
      .from('users')
      .select('birth_date')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setNeeded(data != null && data.birth_date == null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const age = useMemo(() => {
    const d = Number(day)
    const m = Number(month)
    const y = Number(year)
    if (!d || !m || year.length !== 4) return null
    const born = new Date(y, m - 1, d)
    if (born.getDate() !== d || born.getMonth() !== m - 1) return null

    const now = new Date()
    let years = now.getFullYear() - y
    const beforeBirthday =
      now.getMonth() < m - 1 ||
      (now.getMonth() === m - 1 && now.getDate() < d)
    if (beforeBirthday) years -= 1
    return years
  }, [day, month, year])

  const minor = age != null && age < 16
  const tooYoung = age != null && age < 13
  const ready = age != null && !tooYoung && (!minor || ack) && !busy

  async function submit() {
    if (age == null) return
    setBusy(true)
    setError(null)

    const iso = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    const { error: rpcError } = await supabase.rpc('set_birth_date', {
      p_birth_date: iso,
      p_guardian_ack: ack,
    })
    setBusy(false)

    if (rpcError) {
      setError(
        rpcError.message.includes('TOO_YOUNG')
          ? ka
            ? 'აპლიკაცია 13 წლიდანაა.'
            : 'You need to be 13 or older.'
          : ka
            ? 'ვერ შევინახეთ. შეამოწმე თარიღი.'
            : "Couldn't save that. Check the date.",
      )
      return
    }

    setNeeded(false)
  }

  if (!needed) return null

  return (
    <Modal visible transparent={false} statusBarTranslucent animationType="fade">
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.title}>
          {ka ? 'როდის დაიბადე?' : 'When were you born?'}
        </Text>
        <Text style={styles.body}>
          {ka
            ? 'ეს ერთხელ იკითხება. ასაკი განსაზღვრავს, რა ხელმისაწვდომია აპლიკაციაში.'
            : 'Asked once. Your age decides what you can do in the app.'}
        </Text>

        {/* Written out rather than factored into a <Field> component: a
            component defined inside a render is a new type on every keystroke,
            which remounts the input and drops the keyboard focus. */}
        <View style={styles.row}>
          <TextInput
            value={day}
            onChangeText={(next) => setDay(digits(next, 2))}
            placeholder={ka ? 'დღე' : 'DD'}
            placeholderTextColor={c.textFaint}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.input}
          />
          <TextInput
            value={month}
            onChangeText={(next) => setMonth(digits(next, 2))}
            placeholder={ka ? 'თვე' : 'MM'}
            placeholderTextColor={c.textFaint}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.input}
          />
          <TextInput
            value={year}
            onChangeText={(next) => setYear(digits(next, 4))}
            placeholder={ka ? 'წელი' : 'YYYY'}
            placeholderTextColor={c.textFaint}
            keyboardType="number-pad"
            maxLength={4}
            style={[styles.input, styles.inputWide]}
          />
        </View>

        {tooYoung && (
          <Text style={styles.warn}>
            {ka
              ? 'სამწუხაროდ, აპლიკაცია 13 წლიდანაა.'
              : 'Sorry — the app is for ages 13 and up.'}
          </Text>
        )}

        {minor && !tooYoung && (
          <Pressable style={styles.ack} onPress={() => setAck(!ack)}>
            <View style={[styles.box, ack && styles.boxOn]}>
              {ack && <Text style={styles.tick}>✓</Text>}
            </View>
            <Text style={styles.ackText}>
              {ka
                ? 'მშობელმა ან მეურვემ იცის, რომ ამ აპლიკაციას ვიყენებ.'
                : 'A parent or guardian knows I use this app.'}
            </Text>
          </Pressable>
        )}

        {error && <Text style={styles.warn}>{error}</Text>}

        <Pressable
          style={[styles.primary, !ready && styles.disabled]}
          onPress={submit}
          disabled={!ready}
        >
          <Text style={styles.primaryText}>
            {busy
              ? ka ? 'ინახება…' : 'Saving…'
              : ka ? 'გაგრძელება' : 'Continue'}
          </Text>
        </Pressable>

        <Text style={styles.note}>
          {ka
            ? '16 წლიდან ხელმისაწვდომი იქნება ჯგუფური დროფები. თარიღის შეცვლა შემდეგ აღარ შეიძლება.'
            : 'Group drops open up at 16. You cannot change this date later.'}
        </Text>
      </ScrollView>
    </Modal>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: space.xl, paddingTop: space.xxl * 2, gap: space.md },
    title: {
      color: c.text,
      fontSize: font.title.fontSize,
      fontWeight: font.title.fontWeight,
      letterSpacing: font.title.letterSpacing,
    },
    body: { color: c.textMuted, fontSize: 15, lineHeight: 21 },
    row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
    input: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: space.lg,
      textAlign: 'center',
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 2,
    },
    inputWide: { flex: 1.6 },
    warn: { color: c.bad, fontSize: 14, lineHeight: 20 },
    ack: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
    box: {
      width: 26,
      height: 26,
      borderRadius: radius.sm,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { borderColor: c.accent, backgroundColor: c.accent },
    tick: { color: c.bg, fontSize: 15, fontWeight: '900' },
    ackText: { color: c.text, fontSize: 14, flex: 1, lineHeight: 19 },
    primary: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingVertical: space.lg,
      alignItems: 'center',
      marginTop: space.sm,
    },
    disabled: { opacity: 0.4 },
    primaryText: { color: c.bg, fontSize: 16, fontWeight: '800' },
    note: { color: c.textFaint, fontSize: 12, lineHeight: 17 },
  })
