import { cloneElement, isValidElement, type ReactElement } from 'react'
import { Text, type TextProps } from 'react-native'

/**
 * Stop Android splitting Georgian words in half.
 *
 * Android's default line breaker is "highQuality": it balances lines and will
 * hyphenate to do it. In English that is invisible; in Georgian it produces
 * words chopped mid-syllable -- "გამოყენე / ბული" down the middle of a stat
 * card -- which is what every tight box in the app was showing.
 *
 * "simple" is a greedy breaker: it breaks between words only, and if a single
 * word will not fit it overflows rather than butchering it. With hyphenation
 * off as well, Georgian sets the way it reads.
 *
 * Applied once to the Text component rather than passed to several hundred
 * call sites. React deprecates defaultProps for function components, so this
 * wraps the render function, and it uses cloneElement rather than rebuilding
 * the element by hand -- a malformed element here would take out every screen
 * in the app at once. Explicit props on a call site still win.
 */
const DEFAULTS: Partial<TextProps> = {
  textBreakStrategy: 'simple',
  android_hyphenationFrequency: 'none',
}

type TextInternals = {
  render?: (...args: unknown[]) => unknown
  __tqPatched?: boolean
}

export function applyTextDefaults() {
  const target = Text as unknown as TextInternals
  const original = target.render

  if (typeof original !== 'function' || target.__tqPatched) return
  target.__tqPatched = true

  target.render = function patched(...args: unknown[]) {
    const element = original.apply(this, args)
    if (!isValidElement(element)) return element

    const typed = element as ReactElement<TextProps>
    return cloneElement(typed, { ...DEFAULTS, ...typed.props })
  }
}
