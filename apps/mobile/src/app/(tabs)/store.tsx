import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../lib/i18n'
import {
  useTheme,
  useRarity,
  radius,
  space,
  font,
  type Palette,
  type Rarity,
} from '../../lib/theme'

function useStyles() {
  const { c } = useTheme()
  return useMemo(() => makeStyles(c), [c])
}

type Item = {
  code: string
  kind: string
  title_ka: string
  title_en: string
  style_key: string
  rarity: Rarity
  price: number
  owned: boolean
}

/**
 * The store.
 *
 * Coins, not money. Most of these players are minors, and taking their money
 * for digital goods is a different business with different law around it --
 * refunds, parental consent, and Play's rule that digital goods go through Play
 * Billing and its cut. The currency we already have is also the better one:
 * coins come from redeeming vouchers, so the way to afford the Mtatsminda
 * background is to walk into a shop, which is what the venues are paying for.
 */
export default function StoreScreen() {
  const styles = useStyles()
  const { c } = useTheme()
  const rarity = useRarity()
  const { locale } = useTranslation()
  const ka = locale === 'ka'

  const [items, setItems] = useState<Item[]>([])
  const [coins, setCoins] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [catalogue, balance] = await Promise.all([
      supabase.rpc('store_catalogue'),
      supabase.rpc('my_coins'),
    ])
    setItems((catalogue.data as Item[]) ?? [])
    setCoins((balance.data as number) ?? 0)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const buy = useCallback(
    async (item: Item) => {
      setBusy(item.code)
      setMessage(null)
      const { error } = await supabase.rpc('buy_cosmetic', { p_code: item.code })
      setBusy(null)

      if (error) {
        setMessage(
          error.message.includes('NOT_ENOUGH_COINS')
            ? ka
              ? 'მონეტები არ გყოფნის - გამოიყენე ვაუჩერი და მიიღებ 50-ს'
              : 'Not enough coins - redeem a voucher and you get 50'
            : error.message.includes('ALREADY_OWNED')
              ? ka
                ? 'უკვე გაქვს'
                : 'You already own this'
              : ka
                ? 'ვერ მოხერხდა. სცადე ხელახლა.'
                : 'That did not work. Try again.',
        )
        return
      }

      await load()
    },
    [ka, load],
  )

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={c.accent} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.wallet}>
        <View>
          <Text style={styles.eyebrow}>{ka ? 'შენი მონეტები' : 'Your coins'}</Text>
          <Text style={styles.balance}>{coins}</Text>
        </View>
        <Text style={styles.walletHint}>
          {ka
            ? 'ყოველი გამოყენებული ვაუჩერი +50'
            : '+50 for every voucher you use'}
        </Text>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      <Text style={styles.sectionTitle}>{ka ? 'ფონები' : 'Backgrounds'}</Text>

      {items.map((item) => {
        const meta = rarity[item.rarity] ?? rarity.common
        const affordable = coins >= item.price

        return (
          <View key={item.code} style={styles.item}>
            {/* Standing in for the artwork: the rarity colour over the place's
                name, in the shape the picture will take. */}
            <View style={[styles.thumb, { backgroundColor: meta.fill, borderColor: meta.color }]}>
              <Text style={[styles.thumbText, { color: meta.color }]} numberOfLines={2}>
                {ka ? item.title_ka : item.title_en}
              </Text>
            </View>

            <View style={styles.itemBody}>
              <Text style={styles.itemName}>
                {ka ? item.title_ka : item.title_en}
              </Text>
              <Text style={[styles.itemRarity, { color: meta.color }]}>
                {ka ? meta.label.ka : meta.label.en}
              </Text>
            </View>

            {item.owned ? (
              <Text style={styles.owned}>{ka ? 'გაქვს' : 'Owned'}</Text>
            ) : (
              <Pressable
                disabled={!affordable || busy === item.code}
                onPress={() => buy(item)}
                style={[styles.buy, !affordable && styles.buyLocked]}
              >
                {busy === item.code ? (
                  <ActivityIndicator color={c.bg} />
                ) : (
                  <Text style={styles.buyText}>{item.price}</Text>
                )}
              </Pressable>
            )}
          </View>
        )
      })}

      <Text style={styles.footnote}>
        {ka
          ? 'მონეტები ფულით არ იყიდება. მხოლოდ ვაუჩერების გამოყენებით გროვდება.'
          : 'Coins cannot be bought with money. They only come from using vouchers.'}
      </Text>
    </ScrollView>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: space.lg, paddingBottom: space.xl },
    centre: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    wallet: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.lg,
    },
    balance: {
      color: c.accent,
      fontSize: 38,
      fontWeight: '900',
      letterSpacing: 0,
    },
    walletHint: { color: c.textMuted, fontSize: 12, flex: 1, textAlign: 'right' },
    message: { color: c.bad, fontSize: 13, marginTop: space.md },

    sectionTitle: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
      marginTop: space.lg,
      marginBottom: space.sm,
    },

    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.sm,
      marginBottom: space.sm,
    },
    thumb: {
      width: 76,
      height: 54,
      borderRadius: radius.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 4,
    },
    thumbText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
    itemBody: { flex: 1 },
    itemName: { color: c.text, fontSize: 15, fontWeight: '800' },
    itemRarity: { fontSize: 11, fontWeight: '900', marginTop: 2 },
    owned: { color: c.textFaint, fontSize: 12, fontWeight: '800', paddingHorizontal: space.sm },

    buy: {
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      paddingHorizontal: space.lg,
      paddingVertical: 9,
      minWidth: 72,
      alignItems: 'center',
    },
    buyLocked: { opacity: 0.35 },
    buyText: { color: c.bg, fontSize: 14, fontWeight: '900' },

    footnote: {
      color: c.textFaint,
      fontSize: 12,
      lineHeight: 18,
      marginTop: space.md,
    },
  })
