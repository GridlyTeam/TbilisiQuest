/**
 * Bilingual copy for the mobile app.
 *
 * Georgian is the default because the primary audience is local, with English
 * as the fallback for visitors. The device locale decides at first launch and
 * the player can override it in settings.
 *
 * Deliberately a plain object rather than i18next: the string count is small,
 * the two languages are maintained together, and a typed catalogue means a
 * missing Georgian translation is a compile error rather than a runtime
 * fallback nobody notices.
 */

import { useCallback, useSyncExternalStore } from 'react'
import * as Localization from 'expo-localization'

export type Locale = 'ka' | 'en'

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
function deviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode
  return tag === 'ka' ? 'ka' : 'en'
}

let current: Locale = deviceLocale()
const listeners = new Set<() => void>()

export function setLocale(next: Locale) {
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
