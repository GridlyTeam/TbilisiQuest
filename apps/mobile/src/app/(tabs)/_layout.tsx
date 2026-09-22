import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'


export default function TabsLayout() {
  const { c } = useTheme()
  // On a phone using gesture navigation the system swipe bar sits over the
  // bottom of the screen. A fixed-height tab bar puts the icons underneath it,
  // so they are awkward to hit and the swipe fires instead. Lift them by
  // whatever the device says that area is, with a floor for buttoned phones
  // that report nothing.
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, 10)
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '800', letterSpacing: 0 },
        // Sits on the page background rather than a lighter surface: on a
        // near-black app a paler bar reads as a separate panel stuck to the
        // bottom of the screen.
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          height: 56 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0,
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
