'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The small amount of motion the landing page uses.
 *
 * Two rules throughout:
 *
 *  1. Only transform and opacity are animated. Anything else asks the browser
 *     to re-layout sixty times a second, which on a mid-range Android phone --
 *     the device most of this audience is holding -- turns a nice effect into
 *     a stutter.
 *  2. Everything checks prefers-reduced-motion. A person who has asked their
 *     phone to stop moving things has usually asked for a reason.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Reveals an element when it scrolls into view.
 *
 * Returns a ref and a class name; the element starts translated down and
 * transparent, and lands when it is roughly a fifth of the way up the screen.
 * One observer per element is fine at this page's size, and it disconnects
 * after firing, so nothing keeps watching what has already arrived.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (prefersReducedMotion()) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { ref, className: shown ? 'reveal in' : 'reveal' }
}

/**
 * A number that counts up the first time it is seen.
 *
 * Deliberately short -- 900ms and eased out, so it registers as "this is a
 * live number" rather than as a slot machine. The final value is rendered
 * immediately for anyone with reduced motion or no JavaScript timing, because
 * the number is the point and the animation is not.
 */
export function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const ref = useRef<HTMLBRElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || prefersReducedMotion() || value <= 0) {
      setDisplay(value)
      return
    }

    let frame = 0
    let started = false

    const observer = new IntersectionObserver((entries) => {
      if (started || !entries.some((e) => e.isIntersecting)) return
      started = true
      observer.disconnect()

      const duration = 900
      const startedAt = performance.now()

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration)
        // easeOutCubic: fast at first, settles rather than stops dead.
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(value * eased))
        if (progress < 1) frame = requestAnimationFrame(tick)
      }

      setDisplay(0)
      frame = requestAnimationFrame(tick)
    })

    observer.observe(node)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value])

  return (
    <>
      {/* An anchor the observer can watch without wrapping the number in an
          extra box that would break the layout. */}
      <br ref={ref} hidden />
      {display}
    </>
  )
}
