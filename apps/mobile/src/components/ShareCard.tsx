import * as Sharing from 'expo-sharing'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import {
  useTheme,
  useRarity,
  space,
  font,
  type Palette,
  type Rarity,
} from '../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

/**
 * The thing that actually spreads the app.
 *
 * A screenshot of the claim screen would carry the same information, but it
 * carries it in a 9:16 frame full of buttons and a map. This is built for one
 * place: an Instagram or TikTok story, where it has to read in a second at
 * arm's length and leave behind a code someone can type.
 *
 * Rendered off-screen at story proportions and captured at 3x, so what gets
 * shared is a 1080x1920 PNG rather than a screenshot of a phone.
 */
export type ShareCardData = {
  rarity: Rarity
  title: string
  venue: string
  /** e.g. "-30%" or "1+1" -- the number that makes someone stop scrolling. */
  headline: string | null
}

const CARD_W = 360
const CARD_H = 640

export const ShareCardCanvas = forwardRef<View, { data: ShareCardData; code: string | null }>(
  function ShareCardCanvas({ data, code }, ref) {
    const styles = useStyles()
    const rarity = useRarity()
    const { locale } = useTranslation()
    const ka = locale === 'ka'
    const meta = rarity[data.rarity] ?? rarity.common

    return (
      // Parked off-screen rather than hidden: a display:none subtree has no
      // layout, and there is nothing for the capture to read.
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={ref} collapsable={false} style={styles.card}>
          <View style={[styles.glow, { backgroundColor: meta.glow }]} />

          <Text style={styles.brand}>TBILISI QUEST</Text>

          <View style={styles.middle}>
            <View style={[styles.ring, { borderColor: meta.color }]}>
              <Image
                source={require('../../assets/store-icon-192.png')}
                style={styles.icon}
                resizeMode="contain"
              />
            </View>

            <Text style={[styles.rarity, { color: meta.color }]}>
              {meta.label[ka ? 'ka' : 'en'].toUpperCase()}
            </Text>

            {data.headline && (
              <Text style={[styles.headline, { color: meta.color }]}>
                {data.headline}
              </Text>
            )}

            <Text style={styles.title} numberOfLines={2}>
              {data.title}
            </Text>
            <Text style={styles.venue} numberOfLines={1}>
              {data.venue}
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerLead}>
              {ka ? 'შემოგვიერთდი კოდით' : 'Join with my code'}
            </Text>
            <Text style={[styles.code, { color: meta.color }]}>
              {code ?? '••••••'}
            </Text>
          </View>
        </View>
      </View>
    )
  },
)

/** Lazily fetched once per session; the code never changes. */
let cachedCode: string | null = null

export function useReferralCode(): string | null {
  const [code, setCode] = useState<string | null>(cachedCode)

  useEffect(() => {
    if (cachedCode) return
    let cancelled = false

    void supabase
      .rpc('my_referral_code')
      .then(({ data }) => {
        if (cancelled || typeof data !== 'string') return
        cachedCode = data
        setCode(data)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return code
}

/**
 * Capture and hand off to the share sheet.
 *
 * Returns false when sharing is unavailable rather than throwing, so a caller
 * can simply hide the button.
 */
export async function shareCard(ref: React.RefObject<View | null>): Promise<boolean> {
  if (!ref.current) return false
  if (!(await Sharing.isAvailableAsync())) return false

  const uri = await captureRef(ref, {
    format: 'png',
    quality: 1,
    width: CARD_W * 3,
    height: CARD_H * 3,
  })

  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Tbilisi Quest',
  })
  return true
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    offscreen: {
      position: 'absolute',
      left: -CARD_W * 2,
      top: 0,
      opacity: 0,
    },
    card: {
      width: CARD_W,
      height: CARD_H,
      backgroundColor: '#08060F',
      paddingVertical: space.xxl,
      paddingHorizontal: space.xl,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    // A single soft bloom behind the icon does most of the work of making a
    // flat export look lit.
    glow: {
      position: 'absolute',
      width: 460,
      height: 460,
      borderRadius: 230,
      top: 90,
      left: -50,
      opacity: 0.55,
    },
    brand: {
      color: '#F7F5FF',
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 3,
      textAlign: 'center',
    },
    middle: { alignItems: 'center', gap: space.sm },
    ring: {
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 3,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.lg,
    },
    icon: { width: 104, height: 104 },
    rarity: {
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 3,
    },
    headline: {
      fontSize: 64,
      fontWeight: '900',
      letterSpacing: -3,
      marginTop: space.xs,
    },
    title: {
      color: '#F7F5FF',
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.5,
      textAlign: 'center',
      marginTop: space.sm,
    },
    venue: { color: '#9A93B0', fontSize: 15, fontWeight: '600' },
    footer: { alignItems: 'center', gap: 2 },
    footerLead: {
      color: '#9A93B0',
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    code: { fontSize: 34, fontWeight: '900', letterSpacing: 6 },
  })
