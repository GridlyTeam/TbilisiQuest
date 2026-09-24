import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'
import { useTranslation } from '../lib/i18n'
import {
  useTheme,
  useRarity,
  radius,
  space,
  font,
  type Palette,
  type Rarity,
} from '../lib/theme'

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
 * The store, as a panel over the map.
 *
 * It had a tab of its own, which put a shop on the same footing as the map and
 * the player's own character -- five tabs for a thing you visit when you happen
 * to have coins. It opens from the map instead, and the map stays visible
 * behind it, so buying a background never means leaving the city.
 *
 * Coins, not money. Most of these players are minors, and taking their money
 * for digital goods is a different business with different law around it --
 * refunds, parental consent, and Play's rule that digital goods go through Play
 * Billing and its cut. The currency we already have is also the better one:
 * coins come from redeeming vouchers, so the way to afford the Mtatsminda
 * background is to walk into a shop, which is what the venues are paying for.
 */
export default function StorePanel({ onClose }: { onClose: () => void }) {
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

  // Mounted only while open, so opening the panel is what refreshes it.
  useEffect(() => {
    void load()
  }, [load])

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

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <View>
          <Text style={styles.eyebrow}>{ka ? 'მაღაზია' : 'Store'}</Text>
          <Text style={styles.balance}>
            {coins}
            <Text style={styles.balanceUnit}>
              {ka ? ' მონეტა' : ' coins'}
            </Text>
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.close}>{ka ? 'დახურვა' : 'Close'}</Text>
        </Pressable>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          {items.map((item) => {
            const meta = rarity[item.rarity] ?? rarity.common
            const affordable = coins >= item.price

            return (
              <View key={item.code} style={styles.item}>
                <View
                  style={[
                    styles.thumb,
                    { backgroundColor: meta.fill, borderColor: meta.color },
                  ]}
                >
                  <Text
                    style={[styles.thumbText, { color: meta.color }]}
                    numberOfLines={2}
                  >
                    {ka ? item.title_ka : item.title_en}
                  </Text>
                </View>

                <View style={styles.itemBody}>
                  <Text style={styles.itemName} numberOfLines={1}>
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
              ? 'ყოველი გამოყენებული ვაუჩერი +50 მონეტა.'
              : '+50 coins for every voucher you use.'}
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    panel: {
      width: 300,
      maxHeight: 360,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: space.md,
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    eyebrow: {
      color: c.textFaint,
      fontSize: font.eyebrow.fontSize,
      fontWeight: font.eyebrow.fontWeight,
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    balance: { color: c.accent, fontSize: 26, fontWeight: '900', letterSpacing: 0 },
    balanceUnit: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    close: { color: c.textFaint, fontSize: 12, fontWeight: '800', paddingTop: 4 },

    message: { color: c.bad, fontSize: 12, marginBottom: space.sm },
    centre: { paddingVertical: space.xl, alignItems: 'center' },

    list: { flexGrow: 0 },
    listContent: { paddingBottom: 4 },

    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: c.surfaceRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: 6,
      marginBottom: 6,
    },
    thumb: {
      width: 54,
      height: 40,
      borderRadius: radius.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 3,
    },
    thumbText: { fontSize: 8, fontWeight: '900', textAlign: 'center' },
    itemBody: { flex: 1 },
    itemName: { color: c.text, fontSize: 13, fontWeight: '800' },
    itemRarity: { fontSize: 10, fontWeight: '900', marginTop: 1 },
    owned: { color: c.textFaint, fontSize: 11, fontWeight: '800', paddingHorizontal: 6 },

    buy: {
      backgroundColor: c.accent,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: 7,
      minWidth: 58,
      alignItems: 'center',
    },
    buyLocked: { opacity: 0.35 },
    buyText: { color: c.bg, fontSize: 13, fontWeight: '900' },

    footnote: { color: c.textFaint, fontSize: 11, lineHeight: 16, marginTop: 2 },
  })
