import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import { ThemeProvider, useTheme } from '../lib/theme'


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
      </Stack>
    </>
  )
}
