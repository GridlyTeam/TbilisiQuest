import { useState, useMemo } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'
import { useTheme, useRarity, radius, space, type Palette, type Rarity } from '../lib/theme'
import { useTranslation } from '../lib/i18n'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}


export default function LoginScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const { locale, setLocale } = useTranslation()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const ka = locale === 'ka'

  async function submit() {
    setError(null)
    setNotice(null)
    setBusy(true)

    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password })

    setBusy(false)

    if (error) {
      setError(error.message)
      return
    }

    if (mode === 'signup') {
      if (!data.session) {
        setNotice(ka ? 'დაადასტურე ელფოსტა.' : 'Check your email to confirm.')
        setMode('signin')
        return
      }
      // A fresh player needs a profile row before anything references them.
      if (data.user) {
        await supabase.from('users').insert({
          id: data.user.id,
          display_name: email.split('@')[0],
          locale,
        })
      }
    }
    // The root layout's auth listener handles navigation.
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.brand}>Tbilisi Quest</Text>
        <Text style={styles.tagline}>
          {ka ? 'იპოვე ფასდაკლებები ქალაქში' : 'Hunt discounts across the city'}
        </Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder={ka ? 'ელფოსტა' : 'Email'}
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder={ka ? 'პაროლი' : 'Password'}
            placeholderTextColor={c.textFaint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {notice && <Text style={styles.notice}>{notice}</Text>}

          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={c.bg} />
            ) : (
              <Text style={styles.primaryText}>
                {mode === 'signin'
                  ? ka
                    ? 'შესვლა'
                    : 'Sign in'
                  : ka
                    ? 'რეგისტრაცია'
                    : 'Create account'}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setNotice(null)
            }}
          >
            <Text style={styles.switch}>
              {mode === 'signin'
                ? ka
                  ? 'არ გაქვს ანგარიში? რეგისტრაცია'
                  : 'No account? Sign up'
                : ka
                  ? 'უკვე გაქვს ანგარიში? შესვლა'
                  : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.localeToggle}
          onPress={() => setLocale(ka ? 'en' : 'ka')}
        >
          <Text style={styles.localeText}>{ka ? 'English' : 'ქართული'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  inner: { flex: 1, justifyContent: 'center', padding: space.xl },
  brand: { color: c.text, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  tagline: {
    color: c.accent,
    fontSize: 13,
    textAlign: 'center',
    marginTop: space.xs,
    marginBottom: space.xxl,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: space.lg,
    gap: space.md,
  },
  input: {
    backgroundColor: c.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: c.text,
    fontSize: 16,
  },
  primary: {
    backgroundColor: c.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: c.bg, fontWeight: '700', fontSize: 16 },
  switch: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  error: { color: c.bad, fontSize: 13 },
  notice: { color: c.good, fontSize: 13 },
  localeToggle: { marginTop: space.xl, alignSelf: 'center' },
  localeText: { color: c.textFaint, fontSize: 13 },
})
