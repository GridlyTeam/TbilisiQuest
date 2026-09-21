import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import { colors, radius, space } from '../lib/theme'

/**
 * The traffic warning, shown once per calendar day before the first hunt.
 *
 * Once per day rather than once ever: a warning acknowledged during signup
 * three months ago is not in anyone's head on the way to a drop. Once per
 * session would be too often and would train people to dismiss it unread,
 * which is the failure mode every safety notice has.
 *
 * The acknowledgement is stored server-side (users.safety_briefed_on) so
 * clearing app data does not quietly reset it.
 */
export default function SafetyBriefing() {
  const { locale } = useTranslation()
  const [visible, setVisible] = useState(false)
  const ka = locale === 'ka'

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data } = await supabase
        .from('users')
        .select('safety_briefed_on')
        .maybeSingle()

      if (cancelled) return

      const today = new Date().toISOString().slice(0, 10)
      if (!data || data.safety_briefed_on !== today) {
        setVisible(true)
      }
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [])

  async function acknowledge() {
    setVisible(false)
    const today = new Date().toISOString().slice(0, 10)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    await supabase
      .from('users')
      .update({ safety_briefed_on: today })
      .eq('id', auth.user.id)
  }

  const rules: Array<[string, string]> = ka
    ? [
        ['თვალი ასწიე', 'გადასვლამდე და გზაზე — შეხედე ტელეფონს მხოლოდ გაჩერებისას.'],
        ['გზები', 'არასდროს გადახვიდე გზაზე ტელეფონის ყურებით. დროფი არსად წავა.'],
        ['ფეხით', 'თამაში ითიშება სიარულის სიჩქარეზე მეტ სიჩქარეზე.'],
        ['დღისით', 'თამაში მუშაობს 11:00–19:00, დღის სინათლეზე.'],
        ['112', 'საგანგებო ღილაკი ყოველთვის ეკრანზეა.'],
      ]
    : [
        ['Look up', 'Check your surroundings before you check your phone. Stop walking to read the screen.'],
        ['Roads', 'Never cross a road looking at your phone. The drop will still be there.'],
        ['Walking pace', 'The game locks above walking speed. Do not play while driving or cycling.'],
        ['Daylight', 'Hunting runs 11:00–19:00 only.'],
        ['112', 'The emergency button is always on screen.'],
      ]

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {ka ? 'სანამ დაიწყებ' : 'Before you start'}
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {rules.map(([heading, body]) => (
              <View key={heading} style={styles.rule}>
                <Text style={styles.ruleHeading}>{heading}</Text>
                <Text style={styles.ruleBody}>{body}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.button} onPress={acknowledge}>
            <Text style={styles.buttonText}>
              {ka ? 'გასაგებია' : 'I understand'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,16,28,0.94)',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.lg,
    maxHeight: '80%',
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  list: { flexGrow: 0 },
  listContent: { gap: space.lg },
  rule: { gap: 3 },
  ruleHeading: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  ruleBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  buttonText: { color: colors.bg, fontSize: 16, fontWeight: '800' },
})
