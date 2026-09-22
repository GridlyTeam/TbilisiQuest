import { useEffect, useState, useMemo } from 'react'
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import {
  useTheme,
  useRarity,
  radius,
  space,
  type Palette,
  type Rarity,
} from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


/**
 * The traffic warning, shown every time the app is opened.
 *
 * Not once ever, and no longer once per day: a warning acknowledged at signup
 * three months ago is not in anyone's head on the way to a drop, and the
 * audience is teenagers walking through Tbilisi traffic. The cost of showing
 * it again is two seconds; the cost of not showing it does not bear thinking
 * about.
 *
 * "Opened" means a cold launch, or a return to the foreground after the app
 * has been away long enough to be a new outing -- not every tab change, and
 * not the glance at the phone that follows scanning a QR code at a counter.
 * Re-prompting on every remount is the one reliable way to train people to
 * dismiss a safety notice unread.
 *
 * The acknowledgement is still recorded server-side (users.safety_briefed_on)
 * as a record that it was seen.
 */
const RESHOW_AFTER_MS = 2 * 60 * 60 * 1000

// Module scope, so it survives the screen unmounting and remounting but not
// the process being killed -- which is exactly the definition of a launch.
let shownAt: number | null = null

export default function SafetyBriefing() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const [visible, setVisible] = useState(false)
  const ka = locale === 'ka'

  useEffect(() => {
    function showIfDue() {
      if (shownAt !== null && Date.now() - shownAt < RESHOW_AFTER_MS) return
      shownAt = Date.now()
      setVisible(true)
    }

    showIfDue()

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') showIfDue()
    })
    return () => sub.remove()
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
        ['ყურადღებით იყავი', 'გადასვლამდე და გზაზე - შეხედე ტელეფონს მხოლოდ გაჩერებისას.'],
        ['გზები', 'არასდროს გადახვიდე გზაზე ტელეფონის ყურებით. დროფი არსად წავა.'],
        ['ფეხით', 'აპლიკაცია პაუზდება თუ ჩქარა მოძრაობ. ნუ გამოიყენებ აპლიკაციას მანქანის ან სხვა ტრანსპორტის მართვისას.'],
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

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.xl,
    gap: space.lg,
    maxHeight: '80%',
  },
  title: { color: c.text, fontSize: 24, fontWeight: '800' },
  list: { flexGrow: 0 },
  listContent: { gap: space.lg },
  rule: { gap: 3 },
  ruleHeading: { color: c.accent, fontSize: 14, fontWeight: '800' },
  ruleBody: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: c.accent,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  buttonText: { color: c.bg, fontSize: 16, fontWeight: '800' },
})
