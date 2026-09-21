import { Tabs } from 'expo-router'
import { Text } from 'react-native'

import { colors } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'

export default function TabsLayout() {
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: ka ? 'რუკა' : 'Map',
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◎</Text>,
        }}
      />
      <Tabs.Screen
        name="vouchers"
        options={{
          title: ka ? 'ვაუჩერები' : 'Vouchers',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◈</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: ka ? 'პროფილი' : 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◆</Text>,
        }}
      />
    </Tabs>
  )
}
