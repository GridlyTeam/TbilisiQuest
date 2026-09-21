import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native'

import { useTranslation } from '../lib/i18n'
import { colors, radius, space } from '../lib/theme'

/**
 * One tap to emergency services, always on screen.
 *
 * 112 is the pan-European number and works in Georgia. There is a confirmation
 * step because a pocket tap that silently dials emergency services is its own
 * kind of harm -- but the confirmation is one button, not a form.
 */
export default function EmergencyButton() {
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  function call() {
    Alert.alert(
      ka ? '112-ზე დარეკვა?' : 'Call 112?',
      ka
        ? 'დაუკავშირდები საგანგებო სამსახურებს.'
        : 'This will call emergency services.',
      [
        { text: ka ? 'გაუქმება' : 'Cancel', style: 'cancel' },
        {
          text: ka ? 'დარეკვა' : 'Call',
          style: 'destructive',
          onPress: () => {
            void Linking.openURL('tel:112')
          },
        },
      ],
    )
  }

  return (
    <Pressable
      style={styles.button}
      onPress={call}
      accessibilityRole="button"
      accessibilityLabel={ka ? 'საგანგებო ზარი 112' : 'Emergency call 112'}
    >
      <Text style={styles.text}>{ka ? '112 — სასწრაფო' : '112 — Emergency'}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.bad,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    // Comfortably above the 44px minimum: this gets pressed under stress.
    minHeight: 52,
    justifyContent: 'center',
  },
  text: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
})
