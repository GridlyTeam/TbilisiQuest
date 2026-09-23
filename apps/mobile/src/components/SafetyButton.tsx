import { useMemo, useState } from 'react'
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import { useTheme, radius, space, font, type Palette } from '../lib/theme'
import type { Fix } from '../lib/useLocation'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

/**
 * The safety control on the map.
 *
 * It used to be a bare 112 button, which on inspection added no capability at
 * all: every phone dials emergency services from its lock screen, and the
 * button only opened the OS dialer. What it did add was a red emergency
 * trigger on a screen used by fourteen-year-olds, which is a pocket-dial and
 * prank surface, and wasting emergency services' time is a real harm.
 *
 * So the slot now holds the two things players actually need and neither of
 * which existed -- telling us a place is wrong, and telling a parent where they
 * are -- with 112 kept as the third item behind the confirmation it always had.
 */
type Kind = 'unsafe_location' | 'venue_problem' | 'wrong_place' | 'other'

export default function SafetyButton({
  fix,
  dropId,
}: {
  /** Current position, sent with a report so an operator can see where the
   *  player actually stood rather than only which drop they had open. */
  fix?: Fix | null
  dropId?: string | null
}) {
  const styles = useStyles()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [kind, setKind] = useState<Kind>('unsafe_location')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  function close() {
    setOpen(false)
    setReporting(false)
    setSent(false)
    setNote('')
  }

  async function shareLocation() {
    if (!fix) {
      Alert.alert(
        ka ? 'მდებარეობა უცნობია' : 'No location yet',
        ka
          ? 'ჩართე GPS და სცადე ხელახლა.'
          : 'Turn on GPS and try again.',
      )
      return
    }

    // A plain maps link through the system share sheet: it works in any
    // messenger, needs no account on our side, and we store nothing.
    const url = `https://maps.google.com/?q=${fix.latitude},${fix.longitude}`
    await Share.share({
      message: ka
        ? `აქ ვარ ახლა: ${url}`
        : `Here's where I am right now: ${url}`,
    })
    close()
  }

  function call112() {
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

  async function submit() {
    setSending(true)
    const { error } = await supabase.rpc('submit_report', {
      p_kind: kind,
      p_note: note.trim() === '' ? null : note.trim(),
      p_drop_id: dropId ?? null,
      p_lat: fix?.latitude ?? null,
      p_lng: fix?.longitude ?? null,
    })
    setSending(false)

    if (error) {
      Alert.alert(
        ka ? 'ვერ გაიგზავნა' : "Couldn't send",
        error.message.includes('TOO_MANY_OPEN_REPORTS')
          ? ka
            ? 'უკვე გაქვს რამდენიმე გახსნილი შეტყობინება. დაელოდე პასუხს.'
            : 'You already have several open reports. Wait for a reply first.'
          : ka
            ? 'სცადე ხელახლა.'
            : 'Please try again.',
      )
      return
    }

    setSent(true)
  }

  const kinds: Array<[Kind, string]> = ka
    ? [
        ['unsafe_location', 'სახიფათო ადგილია'],
        ['venue_problem', 'მაღაზიასთან პრობლემა'],
        ['wrong_place', 'ადგილი არასწორადაა მონიშნული'],
        ['other', 'სხვა'],
      ]
    : [
        ['unsafe_location', 'This spot is unsafe'],
        ['venue_problem', 'Problem with the shop'],
        ['wrong_place', 'The pin is in the wrong place'],
        ['other', 'Something else'],
      ]

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={ka ? 'უსაფრთხოება' : 'Safety'}
      >
        {/* An "i", not a word: the button sits over the map, where a pill
            wide enough for "დახმარება" covers a street. The label it used to
            carry lives on as the accessibility label above. */}
        <Text style={styles.buttonText}>i</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {sent ? (
              <View style={styles.done}>
                <Text style={styles.title}>
                  {ka ? 'მადლობა' : 'Thank you'}
                </Text>
                <Text style={styles.body}>
                  {ka
                    ? 'შეტყობინება მივიღეთ. ადგილს შევამოწმებთ.'
                    : "We've got it. We'll check this place."}
                </Text>
                <Pressable style={styles.primary} onPress={close}>
                  <Text style={styles.primaryText}>
                    {ka ? 'დახურვა' : 'Close'}
                  </Text>
                </Pressable>
              </View>
            ) : reporting ? (
              <>
                <Text style={styles.title}>
                  {ka ? 'რა ხდება?' : "What's wrong?"}
                </Text>

                <View style={styles.kinds}>
                  {kinds.map(([value, label]) => (
                    <Pressable
                      key={value}
                      onPress={() => setKind(value)}
                      style={[
                        styles.kind,
                        kind === value && styles.kindActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.kindText,
                          kind === value && styles.kindTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={
                    ka ? 'დაწერე რამდენიმე სიტყვა (სურვილისამებრ)' : 'Add a few words (optional)'
                  }
                  placeholderTextColor={styles.placeholder.color}
                  style={styles.input}
                  multiline
                  maxLength={500}
                />

                <Pressable
                  style={[styles.primary, sending && styles.disabled]}
                  onPress={submit}
                  disabled={sending}
                >
                  <Text style={styles.primaryText}>
                    {sending
                      ? ka ? 'იგზავნება…' : 'Sending…'
                      : ka ? 'გაგზავნა' : 'Send'}
                  </Text>
                </Pressable>

                <Pressable onPress={() => setReporting(false)}>
                  <Text style={styles.back}>{ka ? 'უკან' : 'Back'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>
                  {ka ? 'უსაფრთხოება' : 'Safety'}
                </Text>

                <Option
                  label={ka ? 'ადგილის დაფიქსირება' : 'Report a problem'}
                  hint={
                    ka
                      ? 'სახიფათო ადგილი, არასწორი პინი ან პრობლემა მაღაზიაში'
                      : 'An unsafe spot, a wrong pin, or a problem in the shop'
                  }
                  onPress={() => setReporting(true)}
                />

                <Option
                  label={ka ? 'გაუზიარე შენი ადგილი' : 'Share where I am'}
                  hint={
                    ka
                      ? 'გაუგზავნე მშობელს ან მეგობარს ბმული შენი მდებარეობით'
                      : 'Send a parent or friend a link to your location'
                  }
                  onPress={shareLocation}
                />

                <Option
                  label={ka ? 'დარეკე 112-ზე' : 'Call 112'}
                  hint={
                    ka
                      ? 'საგანგებო სამსახურები'
                      : 'Emergency services'
                  }
                  danger
                  onPress={call112}
                />

                {/* The map's own logo and attribution button are switched
                    off so they do not sit under our controls, and OpenStreetMap
                    and CARTO are credited here instead -- their licences ask
                    for attribution, not for a badge on the map itself. */}
                <Text style={styles.credit}>
                  {ka
                    ? 'რუკა: © OpenStreetMap-ის მონაწილეები, © CARTO'
                    : 'Map data © OpenStreetMap contributors, tiles © CARTO'}
                </Text>

                <Pressable onPress={close}>
                  <Text style={styles.back}>{ka ? 'დახურვა' : 'Close'}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

function Option({
  label,
  hint,
  onPress,
  danger,
}: {
  label: string
  hint: string
  onPress: () => void
  danger?: boolean
}) {
  const styles = useStyles()
  const { c } = useTheme()
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
    >
      <Text style={[styles.optionLabel, danger && { color: c.bad }]}>
        {label}
      </Text>
      <Text style={styles.optionHint}>{hint}</Text>
    </Pressable>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    // Same diameter and the same plate as the recentre control it stacks
    // with: two circles of different sizes sitting one above the other read
    // as a mistake, however small the difference.
    button: {
      backgroundColor: c.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    pressed: { opacity: 0.8 },
    buttonText: {
      color: c.text,
      fontSize: 17,
      fontWeight: '900',
      letterSpacing: 0,
      // The glyph's own bearing sits it left of centre in the circle.
      marginLeft: 1,
    },

    credit: {
      color: c.textFaint,
      fontSize: 11,
      textAlign: 'center',
      marginTop: space.sm,
    },

    backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderTopWidth: 1,
      borderColor: c.border,
      padding: space.xl,
      paddingBottom: space.xxl,
      gap: space.md,
    },
    title: {
      color: c.text,
      fontSize: font.heading.fontSize,
      fontWeight: font.heading.fontWeight,
      letterSpacing: 0,
    },
    body: { color: c.textMuted, fontSize: 15, lineHeight: 21 },
    done: { gap: space.md },

    option: {
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
      gap: 3,
    },
    optionPressed: { opacity: 0.75 },
    optionLabel: { color: c.text, fontSize: 16, fontWeight: '700' },
    optionHint: { color: c.textMuted, fontSize: 13, lineHeight: 18 },

    kinds: { gap: space.sm },
    kind: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
    },
    kindActive: { borderColor: c.accent, backgroundColor: c.surfaceRaised },
    kindText: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
    kindTextActive: { color: c.text },

    input: {
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.md,
      color: c.text,
      fontSize: 15,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    placeholder: { color: c.textFaint },

    primary: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingVertical: space.lg,
      alignItems: 'center',
    },
    disabled: { opacity: 0.5 },
    primaryText: { color: c.bg, fontSize: 16, fontWeight: '800' },
    back: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: space.sm,
    },
  })
