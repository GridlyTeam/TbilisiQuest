import * as Clipboard from 'expo-clipboard'
import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
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

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Stats = {
  code: string | null
  invited: number
  converted: number
  xp_earned: number
}

/**
 * Invite friends, and enter the code of whoever invited you.
 *
 * Both sides are paid on the invitee's first redemption rather than at
 * sign-up -- see migration 0021. The copy says so plainly, because a reward
 * people think they have earned and then do not see is worse than no reward.
 */
export default function InviteCard() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [stats, setStats] = useState<Stats | null>(null)
  const [entry, setEntry] = useState('')
  const [entering, setEntering] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    // my_referral_code() allocates one on first call; my_referral_stats() only
    // reads, so the order matters for a player who has never opened this.
    await supabase.rpc('my_referral_code')
    const { data } = await supabase.rpc('my_referral_stats')
    const row = Array.isArray(data) ? data[0] : data
    setStats((row as Stats) ?? null)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function shareInvite() {
    if (!stats?.code) return
    await Share.share({
      message: ka
        ? `შემოდი Tbilisi Quest-ში და დაიჭირე ფასდაკლებები ქალაქში. ჩემი კოდი: ${stats.code}`
        : `Get on Tbilisi Quest and hunt discounts around the city. My code: ${stats.code}`,
    })
  }

  async function copy() {
    if (!stats?.code) return
    await Clipboard.setStringAsync(stats.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function submitCode() {
    const code = entry.trim().toUpperCase()
    if (code.length < 4) return

    setEntering(true)
    setMessage(null)
    const { error } = await supabase.rpc('redeem_referral', { p_code: code })
    setEntering(false)

    if (error) {
      setMessage(translateReferralError(error.message, ka))
      return
    }

    setEntry('')
    setMessage(
      ka
        ? 'კოდი მიღებულია. XP დაგერიცხება პირველივე ვაუჩერის გამოყენებისას.'
        : 'Code accepted. You both get XP when you redeem your first voucher.',
    )
    void load()
  }

  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>{ka ? 'მოიწვიე მეგობარი' : 'Invite a friend'}</Text>

      <Pressable onPress={copy} style={styles.codeBox}>
        <Text style={styles.code}>{stats?.code ?? '••••••'}</Text>
        <Text style={styles.copyHint}>
          {copied
            ? ka ? 'დაკოპირდა' : 'Copied'
            : ka ? 'შეეხე დასაკოპირებლად' : 'Tap to copy'}
        </Text>
      </Pressable>

      {stats && stats.invited > 0 && (
        <Text style={styles.stats}>
          {ka
            ? `${stats.invited} მოწვეული · ${stats.converted} გააქტიურდა · ${stats.xp_earned} XP`
            : `${stats.invited} invited · ${stats.converted} joined · ${stats.xp_earned} XP`}
        </Text>
      )}

      <Pressable style={styles.primary} onPress={shareInvite}>
        <Text style={styles.primaryText}>
          {ka ? 'გაზიარება' : 'Share my code'}
        </Text>
      </Pressable>

      <Text style={styles.note}>
        {ka
          ? 'როცა მოწვეული პირველ ვაუჩერს გამოიყენებს, ორივე იღებთ XP-ს.'
          : 'When your friend redeems their first voucher, you both get XP.'}
      </Text>

      <View style={styles.divider} />

      <Text style={styles.eyebrow}>
        {ka ? 'გაქვს კოდი?' : 'Got a code?'}
      </Text>
      <View style={styles.entryRow}>
        <TextInput
          value={entry}
          onChangeText={setEntry}
          placeholder={ka ? 'მეგობრის კოდი' : "Friend's code"}
          placeholderTextColor={c.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.input}
        />
        <Pressable
          style={[styles.enter, (entering || entry.length < 4) && styles.disabled]}
          onPress={submitCode}
          disabled={entering || entry.length < 4}
        >
          <Text style={styles.enterText}>{ka ? 'შეყვანა' : 'Apply'}</Text>
        </Pressable>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  )
}

function translateReferralError(raw: string, ka: boolean): string {
  if (raw.includes('ALREADY_REFERRED')) {
    return ka ? 'კოდი უკვე გაქვს შეყვანილი.' : "You've already used a code."
  }
  if (raw.includes('UNKNOWN_CODE')) {
    return ka ? 'ასეთი კოდი არ არსებობს.' : 'No such code.'
  }
  if (raw.includes('OWN_CODE')) {
    return ka ? 'საკუთარი კოდი არ ჩაითვლება.' : "That's your own code."
  }
  if (raw.includes('ACCOUNT_TOO_OLD')) {
    return ka
      ? 'კოდის შეყვანა მხოლოდ რეგისტრაციიდან პირველი კვირის განმავლობაშია შესაძლებელი.'
      : 'A code can only be entered in your first week.'
  }
  return ka ? 'ვერ მოხერხდა.' : "That didn't work."
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
      gap: space.sm,
    },
    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: font.eyebrow.letterSpacing,
      textTransform: 'uppercase',
    },
    codeBox: {
      alignItems: 'center',
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: space.lg,
      gap: 2,
    },
    code: {
      color: c.accent,
      fontSize: 34,
      fontWeight: '900',
      letterSpacing: 8,
    },
    copyHint: { color: c.textFaint, fontSize: 11 },
    stats: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
    primary: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingVertical: space.md,
      alignItems: 'center',
    },
    primaryText: { color: c.bg, fontSize: 15, fontWeight: '800' },
    note: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    divider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: space.sm,
    },
    entryRow: { flexDirection: 'row', gap: space.sm },
    input: {
      flex: 1,
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      color: c.text,
      fontSize: 16,
      letterSpacing: 3,
      fontWeight: '700',
    },
    enter: {
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: space.lg,
      justifyContent: 'center',
    },
    enterText: { color: c.text, fontSize: 14, fontWeight: '700' },
    disabled: { opacity: 0.45 },
    message: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  })
