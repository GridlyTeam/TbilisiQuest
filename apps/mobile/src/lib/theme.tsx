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
 * Dark is the default and the one that gets designed: the audience is
 * teenagers, and a near-black ground with saturated accents is what reads as a
 * game rather than as a loyalty card. Light stays available and stays sober --
 * a phone at minimum brightness in direct Tbilisi sun is unreadable on black,
 * and the app is only playable in daylight hours, so this is a real setting
 * rather than a checkbox.
 *
 * Amber is the one colour that cannot simply invert. It glows on near-black
 * and fails contrast outright as text on white, so the light scheme uses a
 * darkened #B76E1F wherever amber carries meaning.
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

// Pushed darker and colder than the original dusk. Saturated colour only
// looks electric against something close to black; on the old #12101C the
// rarity hues read as pastel.
const dark: Palette = {
  bg: '#08060F',
  surface: '#15111F',
  surfaceRaised: '#1F1930',
  border: '#2C2440',
  text: '#F7F5FF',
  textMuted: '#9A93B0',
  textFaint: '#6E6789',
  accent: '#FFB020',
  accentInk: '#FFB020',
  indigo: '#7C5CFF',
  good: '#3BE08A',
  bad: '#FF5C7A',
  overlay: 'rgba(8,6,15,0.97)',
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
        // Cyan / violet / gold, in that order of value. Borrowed from the
        // loot-tier convention every game in this audience's life already
        // teaches: nobody has to be told which one is worth walking for.
        common: {
          color: '#3BD6FF',
          // `fill` tints the marker's ring: the rarity is readable at a glance
          // while the map stays visible underneath.
          fill: 'rgba(59,214,255,0.28)',
          glow: 'rgba(59,214,255,0.55)',
          label: { ka: 'ჩვეულებრივი', en: 'Common' },
        },
        rare: {
          color: '#A855F7',
          fill: 'rgba(168,85,247,0.32)',
          glow: 'rgba(168,85,247,0.75)',
          label: { ka: 'იშვიათი', en: 'Rare' },
        },
        legendary: {
          color: '#FFB020',
          fill: 'rgba(255,176,32,0.34)',
          glow: 'rgba(255,176,32,0.85)',
          label: { ka: 'ლეგენდარული', en: 'Legendary' },
        },
      }
    : {
        common: {
          color: '#0E7490',
          // Slightly stronger on light: a pale tint over pale tiles disappears.
          fill: 'rgba(14,116,144,0.26)',
          glow: 'rgba(14,116,144,0.25)',
          label: { ka: 'ჩვეულებრივი', en: 'Common' },
        },
        rare: {
          color: '#6D28D9',
          fill: 'rgba(109,40,217,0.26)',
          glow: 'rgba(109,40,217,0.25)',
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

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/**
 * One type scale, so headings are decided here rather than re-invented per
 * screen with whatever font size looked right that day.
 *
 * `display` and `title` are deliberately far heavier and tighter than the body
 * sizes: the contrast between an enormous number and small caps underneath it
 * is most of what makes an interface feel like a game instead of a form.
 * `eyebrow` is the small wide-tracked caps label that sits above them.
 */
export const font = {
  display: { fontSize: 56, fontWeight: '900', letterSpacing: 0 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: 0 },
  heading: { fontSize: 20, fontWeight: '800', letterSpacing: 0 },
  body: { fontSize: 15, fontWeight: '500', letterSpacing: 0 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
} as const

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
  // Dark rather than 'system': the look is designed dark, and a player whose
  // phone happens to be in light mode should still get the intended app on
  // first launch. Choosing 'Auto' in settings restores system following.
  const [mode, setModeState] = useState<ThemeMode>('dark')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored)
        }
      })
      .catch(() => {
        // Storage unavailable: the dark default stands.
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
