/**
 * Shared visual language for the player app — the "Tbilisi Dusk" palette.
 *
 * Dark by default: the app is used outdoors and at dusk, and a near-black
 * plum ground makes the rarity-coloured markers the brightest thing on screen,
 * which is where attention should go.
 *
 * The ground is plum-tinted rather than neutral grey (#12101C, not #121212).
 * At a glance it reads as "considered" instead of "default dark mode", and it
 * gives the amber somewhere warm to sit.
 */

export const colors = {
  bg: '#12101C',
  surface: '#1C1A2B',
  surfaceRaised: '#262238',
  border: '#2E2A42',
  text: '#F4F2F8',
  textMuted: '#8E88A0',
  textFaint: '#6E6880',
  accent: '#E0913A',
  indigo: '#6C6BE8',
  good: '#4ED08A',
  bad: '#FF6B6B',
} as const

/**
 * Rarity is the app's core visual signal, so it gets one canonical mapping.
 *
 * The three hues are deliberately far apart. A marker is 44px on a moving map
 * in Tbilisi sunlight, so neighbouring hues would be indistinguishable exactly
 * when the distinction matters most.
 */
export const rarity = {
  common: {
    color: '#8A93A8',
    glow: 'rgba(138,147,168,0.35)',
    label: { ka: 'ჩვეულებრივი', en: 'Common' },
  },
  rare: {
    color: '#6C6BE8',
    glow: 'rgba(108,107,232,0.55)',
    label: { ka: 'იშვიათი', en: 'Rare' },
  },
  legendary: {
    color: '#E0913A',
    glow: 'rgba(224,145,58,0.65)',
    label: { ka: 'ლეგენდარული', en: 'Legendary' },
  },
} as const

export type Rarity = keyof typeof rarity

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
