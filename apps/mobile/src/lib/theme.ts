/**
 * Shared visual language for the player app.
 *
 * Dark by default: the app is used outdoors and at dusk, and a dark map with
 * glowing markers reads better in both conditions than a light one.
 */

export const colors = {
  bg: '#14141A',
  surface: '#1E1E26',
  surfaceRaised: '#262630',
  border: '#2C2C36',
  text: '#F2F2F5',
  textMuted: '#9A9AA8',
  textFaint: '#6A6A78',
  accent: '#E8A33D',
  good: '#3DBE7C',
  bad: '#FF6B6B',
} as const

/** Rarity is the app's core visual signal, so it gets one canonical mapping. */
export const rarity = {
  common: { color: '#7C8B9A', glow: 'rgba(124,139,154,0.35)', label: { ka: 'ჩვეულებრივი', en: 'Common' } },
  rare: { color: '#4A8FD4', glow: 'rgba(74,143,212,0.40)', label: { ka: 'იშვიათი', en: 'Rare' } },
  legendary: { color: '#E8A33D', glow: 'rgba(232,163,61,0.45)', label: { ka: 'ლეგენდარული', en: 'Legendary' } },
} as const

export type Rarity = keyof typeof rarity

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
