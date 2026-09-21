import * as Location from 'expo-location'
import { useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from './supabase'
import { distanceMeters, type Fix } from './useLocation'

/**
 * The client half of the safety controls.
 *
 * Speed can only be judged here: the server never sees velocity, only the
 * coordinates a client chooses to send. So this lock is ergonomics, not a
 * guarantee -- a modified build could skip it. The guarantees (play hours,
 * exclusion zones, manual review) live in the database, where they hold
 * regardless of what the app does.
 */

export type SafetyConfig = {
  playOpensAt: string
  playClosesAt: string
  maxSpeedKmh: number
  minAgeUnaccompanied: number
}

const FALLBACK: SafetyConfig = {
  playOpensAt: '11:00',
  playClosesAt: '19:00',
  maxSpeedKmh: 10,
  minAgeUnaccompanied: 16,
}

export type SafetyState = {
  config: SafetyConfig
  /** Smoothed speed in km/h, or null before enough samples. */
  speedKmh: number | null
  /** True while the player is moving too fast to play. */
  speedLocked: boolean
  /** True outside the daily play window. */
  outsideHours: boolean
  /** Minutes until the window opens, when currently closed. */
  opensInMinutes: number | null
  blocked: boolean
}

function parseHm(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * GPS speed is noisy: a stationary phone under a balcony can report 8 km/h for
 * a sample or two. Taking the median of a short window discards those spikes,
 * and separate lock/unlock thresholds stop the overlay flickering when someone
 * is walking right at the limit.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const WINDOW = 5

export function useSafetyGate(fix: Fix | null): SafetyState {
  const [config, setConfig] = useState<SafetyConfig>(FALLBACK)
  const [speedKmh, setSpeedKmh] = useState<number | null>(null)
  const [speedLocked, setSpeedLocked] = useState(false)
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })

  const samples = useRef<number[]>([])
  const previous = useRef<{ fix: Fix; at: number } | null>(null)

  // Limits are configuration, not constants: the day something goes wrong you
  // want to tighten them without shipping a release.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('safety_config')
      .select('play_opens_at, play_closes_at, max_speed_kmh, min_age_unaccompanied')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setConfig({
          playOpensAt: String(data.play_opens_at).slice(0, 5),
          playClosesAt: String(data.play_closes_at).slice(0, 5),
          maxSpeedKmh: Number(data.max_speed_kmh),
          minAgeUnaccompanied: Number(data.min_age_unaccompanied),
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMinutes(d.getHours() * 60 + d.getMinutes())
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!fix) return
    const at = Date.now()
    const prev = previous.current
    previous.current = { fix, at }

    if (!prev) return

    const seconds = (at - prev.at) / 1000
    if (seconds < 0.5) return

    const metres = distanceMeters(
      prev.fix.latitude,
      prev.fix.longitude,
      fix.latitude,
      fix.longitude,
    )

    // A fix with poor accuracy can imply huge speed from pure jitter. Ignore
    // samples where the movement is within the error bars.
    const noiseFloor = Math.max(fix.accuracy, prev.fix.accuracy, 5)
    const kmh = metres < noiseFloor ? 0 : (metres / seconds) * 3.6

    samples.current = [...samples.current, kmh].slice(-WINDOW)
    if (samples.current.length < 3) return

    const smoothed = median(samples.current)
    setSpeedKmh(smoothed)

    // Hysteresis: lock at the limit, unlock only once clearly below it.
    setSpeedLocked((locked) =>
      locked ? smoothed > config.maxSpeedKmh * 0.6 : smoothed > config.maxSpeedKmh,
    )
  }, [fix, config.maxSpeedKmh])

  return useMemo(() => {
    const opens = parseHm(config.playOpensAt)
    const closes = parseHm(config.playClosesAt)
    const outsideHours = nowMinutes < opens || nowMinutes >= closes

    const opensInMinutes = !outsideHours
      ? null
      : nowMinutes < opens
        ? opens - nowMinutes
        : 24 * 60 - nowMinutes + opens

    return {
      config,
      speedKmh,
      speedLocked,
      outsideHours,
      opensInMinutes,
      blocked: speedLocked || outsideHours,
    }
  }, [config, speedKmh, speedLocked, nowMinutes])
}
