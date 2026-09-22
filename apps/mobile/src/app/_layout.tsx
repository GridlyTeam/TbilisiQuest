import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import { ThemeProvider, useTheme } from '../lib/theme'
import { applyTextDefaults } from '../lib/text-defaults'
import { usePushToken } from '../lib/usePushToken'
import AgeGate from '../components/AgeGate'


// Once, at module load, before anything renders.
applyTextDefaults()

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  )
}

function RootNavigator() {
  const { c } = useTheme()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const segments = useSegments()
  const router = useRouter()

  // Only once there is a session: the permission prompt is worth far more
  // after someone has seen the map than on a login screen, and Android only
  // ever asks once.
  usePushToken(session != null)

  // An account with no public.users row can neither claim nor be asked for a
  // birth date -- the gate reads "no row" as "nothing to ask". The trigger in
  // migration 0029 prevents it at source; this repairs anything that slipped
  // through before it, on the next launch.
  useEffect(() => {
    if (!session) return
    void supabase.rpc('ensure_profile')
  }, [session])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Redirect once the session state is actually known -- routing on the initial
  // null would bounce a signed-in player to the login screen on every cold start.
  useEffect(() => {
    if (loading) return
    const onAuthScreen = segments[0] === 'login'

    if (!session && !onAuthScreen) {
      router.replace('/login')
    } else if (session && onAuthScreen) {
      router.replace('/')
    }
  }, [session, loading, segments, router])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  return (
    <>
      <StatusBar style={c.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="drop/[id]"
          options={{ presentation: 'modal', title: '' }}
        />
        <Stack.Screen name="scan/[id]" options={{ headerShown: false }} />
      </Stack>

      {/* Covers everything until a date of birth is on file. Rendered here
          rather than inside the tabs so it cannot be dodged by deep-linking
          straight to a drop. */}
      {session && <AgeGate />}
    </>
  )
}
