import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { Platform } from 'react-native'

import { supabase } from './supabase'

/**
 * Register this device for the daily drop notification.
 *
 * Push is the retention backbone of an app like this: the drop window opens at
 * a fixed hour, and a player who does not know that today's drops are live is a
 * player who does not come. Everything else in the app is pull.
 *
 * The permission prompt fires on first launch after sign-in rather than at
 * sign-up, because a prompt shown before anyone knows what the app does is a
 * prompt that gets denied permanently, and Android never asks twice.
 */
export function usePushToken(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function register() {
      // A simulator has no push service; asking would fail and, worse, would
      // burn the one prompt on a device that cannot receive anything.
      if (!Device.isDevice) return

      if (Platform.OS === 'android') {
        // Without a channel, Android silently drops notifications on 8+.
        await Notifications.setNotificationChannelAsync('drops', {
          name: 'Drops',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 200, 100, 200],
        })
      }

      const existing = await Notifications.getPermissionsAsync()
      let status = existing.status

      if (status === 'undetermined') {
        status = (await Notifications.requestPermissionsAsync()).status
      }
      if (status !== 'granted' || cancelled) return

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId

      if (!projectId) return

      const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
        .data
      if (cancelled || !token) return

      // Stored through an RPC rather than a table update so the row can never
      // be written for anyone but the caller.
      await supabase.rpc('set_push_token', { p_token: token })
    }

    void register().catch(() => {
      // A device that will not register is not a reason to break the app.
    })

    return () => {
      cancelled = true
    }
  }, [enabled])
}

/** Foreground presentation: a notification that arrives while the map is open
 *  should still be seen, since it is usually "drops are live right now". */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})
