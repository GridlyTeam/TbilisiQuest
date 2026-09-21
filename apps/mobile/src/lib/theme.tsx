import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useColorScheme } from 'react-native'

/**
 * Tbilisi Dusk, in two schemes.
 *
 * The app is used outdoors: dark for dusk and evening, light because a phone
 * at minimum brightness in direct Tbilisi sun is unreadable on a dark ground.
 * Both carry the same hues; only their lightness flips.
 *
 * Amber is the one colour that cannot simply invert. #E0913A glows beautifully
 * on near-black and fails contrast outright as text on white, so the light
 * scheme uses a darkened #B76E1F wherever amber carries meaning.
 */

export type Palette = {
  bg: string
  surface: string
  surfaceRaised: string
  border: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  /** Amber that is safe to put text on, or to use as text. */
  accentInk: string
  indigo: string
  good: string
  bad: string
  overlay: string
  mapStyle: string
  isDark: boolean
}

const dark: Palette = {
  bg: '#12101C',
  surface: '#1C1A2B',
  surfaceRaised: '#262238',
  border: '#2E2A42',
  text: '#F4F2F8',
  textMuted: '#8E88A0',
  textFaint: '#6E6880',
  accent: '#E0913A',
  accentInk: '#E0913A',
  indigo: '#6C6BE8',
  good: '#4ED08A',
  bad: '#FF6B6B',
  overlay: 'rgba(18,16,28,0.97)',
  mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  isDark: true,
}

const light: Palette = {
  bg: '#F3F1EE',
  surface: '#FFFFFF',
  surfaceRaised: '#FAF8F5',
  border: '#E3DFDA',
  text: '#171526',
  textMuted: '#6B6579',
  textFaint: '#8B8497',
  accent: '#E0913A',
  accentInk: '#B76E1F',
  indigo: '#4C3A8C',
  good: '#2C6B43',
  bad: '#A3271F',
  overlay: 'rgba(243,241,238,0.97)',
  mapStyle: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  isDark: false,
}

/**
 * Rarity keeps its hues across both schemes so the signal never changes
 * meaning, but the light scheme darkens them enough to stay legible against a
 * pale basemap.
 */
export const rarityFor = (p: Palette) =>
  p.isDark
    ? {
        common: {
          color: '#8A93A8',
          // `fill` tints an undiscovered drop's circle: the rarity is readable
          // at a glance, but the map stays visible underneath so the marker
          // reads as an area rather than a pin.
          fill: 'rgba(138,147,168,0.30)',
          glow: 'rgba(138,147,168,0.35)',
          label: { ka: 'ჩვეულებრივი', en: 'Common' },
        },
        rare: {
          color: '#6C6BE8',
          fill: 'rgba(108,107,232,0.32)',
          glow: 'rgba(108,107,232,0.55)',
          label: { ka: 'იშვიათი', en: 'Rare' },
        },
        legendary: {
          color: '#E0913A',
          fill: 'rgba(224,145,58,0.34)',
          glow: 'rgba(224,145,58,0.65)',
          label: { ka: 'ლეგენდარული', en: 'Legendary' },
        },
      }
    : {
        common: {
          color: '#5D6B8A',
          // Slightly stronger on light: a pale tint over pale tiles disappears.
          fill: 'rgba(93,107,138,0.26)',
          glow: 'rgba(93,107,138,0.25)',
          label: { ka: 'ჩვეულებრივი', en: 'Common' },
        },
        rare: {
          color: '#4C3A8C',
          fill: 'rgba(76,58,140,0.26)',
          glow: 'rgba(76,58,140,0.25)',
          label: { ka: 'იშვიათი', en: 'Rare' },
        },
        legendary: {
          color: '#B76E1F',
          fill: 'rgba(183,110,31,0.28)',
          glow: 'rgba(183,110,31,0.3)',
          label: { ka: 'ლეგენდარული', en: 'Legendary' },
        },
      }

export type Rarity = 'common' | 'rare' | 'legendary'

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'tq.theme'

type Ctx = {
  c: Palette
  mode: ThemeMode
  setMode: (next: ThemeMode) => void
}

const ThemeContext = createContext<Ctx | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored)
        }
      })
      .catch(() => {
        // Storage unavailable: following the system setting is a fine default.
      })
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }, [])

  const c = useMemo(() => {
    const effective = mode === 'system' ? (system ?? 'dark') : mode
    return effective === 'light' ? light : dark
  }, [mode, system])

  const value = useMemo(() => ({ c, mode, setMode }), [c, mode, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

/** Rarity palette for the active scheme. */
export function useRarity() {
  const { c } = useTheme()
  return useMemo(() => rarityFor(c), [c])
}
