/**
 * Bilingual copy for the mobile app.
 *
 * Georgian is the default because the primary audience is local, with English
 * offered for visitors. The device locale is deliberately NOT consulted: a
 * phone bought abroad, or one left on English by habit, is common in Tbilisi
 * and would otherwise hide the Georgian the app is written for. The player
 * picks a language in settings and that choice is remembered.
 *
 * Deliberately a plain object rather than i18next: the string count is small,
 * the two languages are maintained together, and a typed catalogue means a
 * missing Georgian translation is a compile error rather than a runtime
 * fallback nobody notices.
 */

import { useCallback, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type Locale = 'ka' | 'en'

/**
 * The languages offered in the picker, in the order they are shown.
 *
 * `label` is each language's name in itself -- someone who has accidentally
 * put the app into a language they cannot read still needs to find their way
 * back out, and "English" is only useful if it is written in English.
 */
export const LOCALES: readonly { code: Locale; label: string }[] = [
  { code: 'ka', label: 'ქართული' },
  { code: 'en', label: 'English' },
]

const catalogue = {
  'common.allow': { ka: 'ნებართვა', en: 'Allow' },
  'common.cancel': { ka: 'გაუქმება', en: 'Cancel' },
  'common.retry': { ka: 'ხელახლა', en: 'Try again' },

  'redeem.locating': {
    ka: 'მდებარეობის დადგენა…',
    en: 'Finding your location…',
  },
  'redeem.getCloser': { ka: 'მიუახლოვდი', en: 'Get closer' },
  'redeem.distanceM': { ka: '{{metres}} მეტრი დაშორებით', en: '{{metres}} m away' },
  'redeem.distanceKm': { ka: '{{km}} კმ დაშორებით', en: '{{km}} km away' },
  'redeem.scanCounterCode': {
    ka: 'დაასკანერე კოდი',
    en: 'Scan the counter code',
  },
  'redeem.pointAtDisplay': {
    ka: 'მიმართე კამერა სალაროსთან არსებულ ეკრანს',
    en: 'Point your camera at the display on the counter',
  },
  'redeem.verifying': { ka: 'მოწმდება…', en: 'Verifying…' },

  'redeem.cameraNeeded': { ka: 'საჭიროა კამერა', en: 'Camera access needed' },
  'redeem.cameraWhy': {
    ka: 'კოდის დასასკანირებლად საჭიროა კამერაზე წვდომა.',
    en: 'We need the camera to scan the code at the counter.',
  },
  'redeem.locationDenied': {
    ka: 'მდებარეობაზე წვდომა აუცილებელია ვაუჩერის გამოსაყენებლად.',
    en: 'Location access is required to redeem a voucher.',
  },

  'redeem.outOfRange': {
    ka: 'ძალიან შორს ხარ ({{metres}} მ).',
    en: "You're too far away ({{metres}} m).",
  },
  'redeem.badCounterCode': {
    ka: 'კოდი არასწორია ან ვადაგასულია.',
    en: 'That code is wrong or has expired.',
  },
  'redeem.wrongVenueCode': {
    ka: 'ეს კოდი სხვა ადგილს ეკუთვნის.',
    en: 'That code belongs to a different venue.',
  },
  'redeem.alreadyRedeemed': {
    ka: 'ეს ვაუჩერი უკვე გამოყენებულია.',
    en: 'This voucher has already been used.',
  },
  'redeem.holdExpired': {
    ka: 'ჯავშნის დრო ამოიწურა.',
    en: 'Your hold on this voucher expired.',
  },
  'redeem.notYours': {
    ka: 'ეს ვაუჩერი სხვას ეკუთვნის.',
    en: 'That voucher belongs to someone else.',
  },
  'redeem.genericError': {
    ka: 'რაღაც ვერ გამოვიდა. სცადე ხელახლა.',
    en: 'Something went wrong. Please try again.',
  },
  'redeem.tryAgain': { ka: 'სცადე ხელახლა', en: 'Scan again' },
} as const

export type MessageKey = keyof typeof catalogue

// ---------------------------------------------------------------------------
// Minimal store so a locale change re-renders every consumer.
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'tq.locale'

let current: Locale = 'ka'
const listeners = new Set<() => void>()

// Restore the saved choice. This lands a frame or two after first paint, which
// is why the default is Georgian rather than a neutral placeholder: a player
// who has never chosen sees the right language immediately, and one who has
// chosen English sees at most one frame of Georgian.
void AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored === 'ka' || stored === 'en') {
      if (stored === current) return
      current = stored
      listeners.forEach((fn) => fn())
    }
  })
  .catch(() => {})

export function setLocale(next: Locale) {
  void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  if (next === current) return
  current = next
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  )
}

export function useTranslation() {
  const locale = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )

  const t = useCallback(
    (key: string, vars?: Record<string, unknown>) => {
      const entry = catalogue[key as MessageKey]
      // A missing key is a bug, not a user-facing state -- surface it loudly in
      // development rather than rendering an empty string.
      if (!entry) {
        if (__DEV__) console.warn(`[i18n] missing key: ${key}`)
        return key
      }
      return interpolate(entry[locale], vars)
    },
    [locale],
  )

  return { t, locale, setLocale }
}
