import { Tabs } from 'expo-router'
import { Text } from 'react-native'

import { useTheme, useRarity, radius, space, type Palette, type Rarity } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'


export default function TabsLayout() {
  const { c } = useTheme()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
        },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
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
