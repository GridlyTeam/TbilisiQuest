import { useMemo } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native'

import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, type Palette } from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

/**
 * One tap to emergency services.
 *
 * A compact pill rather than a full-width bar: it has to be reachable at a
 * glance without eating the map, which is the thing the player is actually
 * using. It stays well above the 44px touch minimum because it gets pressed
 * under stress, one-handed, possibly while moving.
 *
 * The confirmation step exists because a pocket tap that silently dials
 * emergency services is its own kind of harm — but it is one button, not a
 * form.
 */
export default function EmergencyButton() {
  const styles = useStyles()
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
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={call}
      accessibilityRole="button"
      accessibilityLabel={ka ? 'საგანგებო ზარი 112' : 'Emergency call 112'}
    >
      <Text style={styles.text}>112</Text>
    </Pressable>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    button: {
      backgroundColor: c.bad,
      borderRadius: radius.pill,
      paddingHorizontal: space.lg,
      height: 48,
      minWidth: 72,
      alignItems: 'center',
      justifyContent: 'center',
      // Lifted off the map so it reads as a control, not a label.
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
    pressed: { opacity: 0.8 },
    text: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  })
