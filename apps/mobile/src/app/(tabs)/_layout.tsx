import { Tabs } from 'expo-router'
import { Text } from 'react-native'

import { useTheme } from '../../lib/theme'
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
        headerTitleStyle: { fontWeight: '800', letterSpacing: -0.3 },
        // Sits on the page background rather than a lighter surface: on a
        // near-black app a paler bar reads as a separate panel stuck to the
        // bottom of the screen.
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.4,
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
