import * as Location from 'expo-location'
import { useEffect, useState } from 'react'

export type Fix = {
  latitude: number
  longitude: number
  accuracy: number
}

type State = {
  fix: Fix | null
  error: string | null
  permission: 'unknown' | 'granted' | 'denied'
}

/**
 * A single live GPS watch, shared by the map and the claim flow.
 *
 * `distanceInterval` rather than a tight timer: a stationary phone stops
 * emitting updates entirely, which matters because this runs for as long as the
 * map is open and GPS is the biggest battery cost in the app.
 */
export function useLocation(enabled = true): State {
  const [state, setState] = useState<State>({
    fix: null,
    error: null,
    permission: 'unknown',
  })

  useEffect(() => {
    if (!enabled) return

    let subscription: Location.LocationSubscription | undefined
    let cancelled = false

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (cancelled) return

      if (status !== 'granted') {
        setState({ fix: null, error: 'Location permission denied', permission: 'denied' })
        return
      }

      setState((s) => ({ ...s, permission: 'granted' }))

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 4000,
        },
        (position) => {
          if (cancelled) return
          setState({
            fix: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? 0,
            },
            error: null,
            permission: 'granted',
          })
        },
      )
    }

    void start()
    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [enabled])

  return state
}

/** Metres between two WGS84 points. */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
