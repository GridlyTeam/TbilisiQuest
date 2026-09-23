'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/**
 * Bilingual copy for the merchant portal.
 *
 * Georgian first in the catalogue because the audience is local business
 * owners. The stored preference is per-browser, which suits the real usage
 * pattern: the owner's laptop and the counter tablet are different devices and
 * often different people.
 */

export type Locale = 'ka' | 'en'

const catalogue = {
  // Brand + navigation
  'nav.drops': { ka: 'დროფები', en: 'Drops' },
  'nav.counter': { ka: 'სალარო', en: 'Counter' },
  'nav.analytics': { ka: 'ანალიტიკა', en: 'Analytics' },
  'nav.signOut': { ka: 'გასვლა', en: 'Sign out' },
  'nav.subtitle': { ka: 'მერჩანტის პორტალი', en: 'Merchant portal' },

  // Auth
  'auth.email': { ka: 'ელფოსტა', en: 'Email' },
  'auth.password': { ka: 'პაროლი', en: 'Password' },
  'auth.signIn': { ka: 'შესვლა', en: 'Sign in' },
  'auth.createAccount': { ka: 'ანგარიშის შექმნა', en: 'Create account' },
  'auth.working': { ka: 'მუშავდება…', en: 'Working…' },
  'auth.noAccount': { ka: 'არ გაქვს ანგარიში? დარეგისტრირდი', en: "Don't have an account? Sign up" },
  'auth.haveAccount': { ka: 'უკვე გაქვს ანგარიში? შედი', en: 'Already have an account? Sign in' },
  'auth.confirmEmail': {
    ka: 'ანგარიში შეიქმნა. დაადასტურე ელფოსტა და შემდეგ შედი.',
    en: 'Account created. Check your email to confirm it, then sign in.',
  },

  // No venue linked
  'noVenue.title': { ka: 'ობიექტი არ არის მიბმული', en: 'No venue linked yet' },
  'noVenue.body': {
    ka: 'შენი ანგარიში არცერთ ობიექტზე არ არის მიბმული. მფლობელმა უნდა დაგამატოს, ან თავად გაუშვი ეს SQL:',
    en: "Your account isn't connected to a venue. An owner needs to add you, or you can link yourself in the Supabase SQL editor:",
  },
  'noVenue.hint': {
    ka: 'ეს ID ეკუთვნის Fabrika Coffee Room-ს სატესტო მონაცემებიდან.',
    en: 'That venue id is Fabrika Coffee Room from the seed data.',
  },

  // Drops list
  'drops.scheduled': { ka: 'დაგეგმილი დროფები', en: 'Scheduled drops' },
  'drops.empty': {
    ka: 'ჯერ არაფერია. შექმენი პირველი დროფი ქვემოთ.',
    en: 'No drops yet. Create your first one below.',
  },
  'drops.claimed': { ka: 'აღებული', en: 'claimed' },
  'drops.live': { ka: 'აქტიური', en: 'Live' },
  'drops.ended': { ka: 'დასრულდა', en: 'Ended' },
  'drops.queued': { ka: 'რიგში', en: 'Queued' },
  'drops.boss': { ka: 'ბოსი', en: 'Boss' },
  'drops.noAccess': {
    ka: 'შენი როლი არ მოიცავს დროფების მართვას. გადადი სალაროს ტაბზე.',
    en: "Your role doesn't include drop management. Head to the Counter tab.",
  },

  'drops.awaitingReview': { ka: 'შემოწმების მოლოდინში', en: 'Awaiting safety check' },
  'drops.reviewAction': { ka: 'უსაფრთხოება შემოწმებულია', en: 'Mark as checked' },
  'drops.reviewHint': {
    ka: 'დროფი რუკაზე არ გამოჩნდება, სანამ ადგილს ხელით არ შეამოწმებ: გზები, კიბეები, სამშენებლო უბნები.',
    en: 'A drop stays hidden from the map until someone has checked its surroundings by hand: roads, stairs, building sites.',
  },
  'drops.reviewed': { ka: 'შემოწმებული', en: 'Checked' },

  // Drop creator
  'creator.title': { ka: 'დროფის დაგეგმვა', en: 'Schedule a drop' },
  'creator.timezoneNote': {
    ka: 'დრო მითითებულია {{tz}} სარტყელში. ვაუჩერები იჯავშნება დროფის გააქტიურებისთანავე.',
    en: 'Times are in {{tz}}. Vouchers are reserved the moment the drop goes live.',
  },
  'creator.sectionOffer': { ka: 'შეთავაზება', en: 'Offer' },
  'creator.sectionWhen': { ka: 'როდის', en: 'When' },
  'creator.sectionHowMany': { ka: 'რამდენი', en: 'How many' },
  'creator.sectionPerks': { ka: 'მოთამაშის ბონუსები', en: 'Player perks' },

  'creator.titleEn': { ka: 'სათაური (ინგლისურად)', en: 'Title (English)' },
  'creator.titleKa': { ka: 'სათაური (ქართულად)', en: 'Title (Georgian)' },
  'creator.offerType': { ka: 'შეთავაზების ტიპი', en: 'Offer type' },
  'creator.percentOff': { ka: 'პროცენტული ფასდაკლება', en: 'Percentage off' },
  'creator.bogo': { ka: 'ორი ერთის ფასად', en: 'Buy one get one' },
  'creator.freeItem': { ka: 'უფასო პროდუქტი', en: 'Free item' },
  'creator.discountPct': { ka: 'ფასდაკლება %', en: 'Discount %' },
  'creator.itemValue': { ka: 'ღირებულება (ლარი)', en: 'Item value (GEL)' },
  'creator.itemValueHint': { ka: 'გამოიყენება ანგარიშგებისთვის', en: 'Used for ROI reporting' },

  'creator.date': { ka: 'თარიღი', en: 'Date' },
  'creator.start': { ka: 'დაწყება', en: 'Start' },
  'creator.end': { ka: 'დასრულება', en: 'End' },
  'creator.duration': { ka: '{{minutes}} წუთი', en: '{{minutes}} min window' },
  'creator.presetAfternoon': { ka: 'შუადღის დაცემა', en: 'Afternoon lull' },
  'creator.presetMorning': { ka: 'გვიანი დილა', en: 'Late morning' },
  'creator.presetEvening': { ka: 'გვიანი საღამო', en: 'Late evening' },
  'creator.windowPassed': { ka: 'ეს დრო დღეს უკვე გავიდა.', en: 'That window has already ended today.' },
  'creator.useTomorrow': { ka: 'ხვალ გადატანა', en: 'Use tomorrow' },

  'creator.cap': { ka: 'მარაგის ლიმიტი', en: 'Inventory cap' },
  'creator.capHint': {
    ka: 'მკაცრი ლიმიტი. ამოწურვის შემდეგ დროფი ქრება რუკიდან.',
    en: 'A hard limit. Once these are gone the drop disappears from the map.',
  },
  'creator.maxGiveaway': { ka: 'მაქსიმალური დანახარჯი', en: 'Maximum you could give away' },
  'creator.giveawayNote': {
    ka: '{{count}} ვაუჩერი, თუ ყველა გამოყენებული იქნება.',
    en: '{{count}} vouchers, assuming every one is redeemed.',
  },
  'creator.confirmCost': {
    ka: 'ვადასტურებ, რომ ამ დროფმა შეიძლება {{amount}} ლარი დამიჯდეს.',
    en: 'I understand this drop could cost up to {{amount}} GEL.',
  },

  'creator.earlyAccessLevel': { ka: 'ადრეული წვდომა დონიდან', en: 'Early access from level' },
  'creator.earlyAccessHint': { ka: '0 გამორთავს ამ ფუნქციას', en: '0 disables early access' },
  'creator.earlyMinutes': { ka: 'რამდენი წუთით ადრე', en: 'Minutes early' },
  'creator.bossChest': { ka: 'გამოყოფა როგორც პრემიუმ ზარდახშა', en: 'Highlight as a Premium Chest' },
  'creator.bossChestOn': {
    ka: 'გადიდებული, მანათობელი აღნიშვნა მოთამაშის რუკაზე.',
    en: 'Oversized marker with a glow effect on the player map.',
  },
  'creator.bossChestOff': { ka: 'ხელმისაწვდომია Premium გეგმაზე.', en: 'Available on the Premium plan.' },

  'creator.submit': { ka: 'დროფის დაგეგმვა', en: 'Schedule drop' },
  'creator.submitting': { ka: 'იგეგმება…', en: 'Scheduling…' },
  'creator.confirmFirst': {
    ka: 'ჯერ დაადასტურე მოსალოდნელი დანახარჯი.',
    en: 'Confirm the projected giveaway before scheduling.',
  },
  'creator.errTitleKa': { ka: 'ქართული სათაური აუცილებელია', en: 'Georgian title is required' },
  'creator.errTitleEn': { ka: 'ინგლისური სათაური აუცილებელია', en: 'English title is required' },
  'creator.errEndAfterStart': {
    ka: 'დასრულება დაწყებაზე გვიან უნდა იყოს',
    en: 'End time must be after start time',
  },
  'creator.errDiscount': { ka: 'მიუთითე ფასდაკლების პროცენტი', en: 'Set a discount percentage' },
  'creator.errDiscountBand': {
    ka: 'ეს პროცენტი არ შეესაბამება არჩეულ იშვიათობას',
    en: 'That percentage does not match the chosen rarity',
  },
  'creator.errDate': { ka: 'აირჩიე თარიღი', en: 'Pick a date' },

  // Rarity
  'rarity.common': { ka: 'ჩვეულებრივი', en: 'Common' },
  'rarity.rare': { ka: 'იშვიათი', en: 'Rare' },
  'rarity.legendary': { ka: 'ლეგენდარული', en: 'Legendary' },
  'rarity.commonHint': { ka: 'ფასდაკლება 5–40%', en: '5–40% off' },
  'rarity.rareHint': { ka: '1+1 ან 41–69%', en: 'Buy one get one, or 41–69%' },
  'rarity.legendaryHint': { ka: 'უფასო ან 70–100%', en: 'Free item, or 70–100%' },

  // Counter
  'counter.instruction': {
    ka: 'სთხოვე კლიენტს დაასკანეროს ეს კოდი',
    en: 'Ask the customer to scan this code to redeem',
  },
  'counter.refreshesIn': { ka: 'განახლდება {{seconds}} წამში', en: 'Refreshes in {{seconds}}s' },
  'counter.note': {
    ka: 'დატოვე ეს ეკრანი სალაროსთან. კოდი იცვლება ყოველ 30 წამში, ამიტომ მისი ფოტო მალევე კარგავს ძალას.',
    en: 'Leave this screen open on the counter. The code changes every 30 seconds, so a photo of it stops working almost immediately.',
  },

  // Analytics
  'analytics.gotClose': { ka: 'მიუახლოვდნენ', en: 'People who got close' },
  'analytics.gotCloseHint': { ka: 'გადმოკვეთეს გახსნის რადიუსი', en: 'Crossed the reveal radius' },
  'analytics.walkedIn': { ka: 'შემოვიდნენ და გამოიყენეს', en: 'Walked in and redeemed' },
  'analytics.walkedInHint': { ka: 'რეალური ვიზიტორები', en: 'Actual foot traffic' },
  'analytics.discountGiven': { ka: 'გაცემული ფასდაკლება', en: 'Discount given' },
  'analytics.discountHint': { ka: 'გაცემული ღირებულება', en: 'Face value handed over' },
  'analytics.performance': { ka: 'დროფების შედეგები', en: 'Drop performance' },
  'analytics.empty': {
    ka: 'ჯერ მონაცემები არ არის. ციფრები გამოჩნდება, როცა მოთამაშეები დაიწყებენ შენი დროფების პოვნას.',
    en: 'Nothing to report yet. Numbers appear once players start finding your drops.',
  },
  'analytics.colDrop': { ka: 'დროფი', en: 'Drop' },
  'analytics.colSeen': { ka: 'ნანახი', en: 'Seen' },
  'analytics.colRevealed': { ka: 'გახსნილი', en: 'Revealed' },
  'analytics.colClaimed': { ka: 'აღებული', en: 'Claimed' },
  'analytics.colRedeemed': { ka: 'გამოყენებული', en: 'Redeemed' },
  'analytics.colConversion': { ka: 'კონვერსია', en: 'Conversion' },
  'analytics.explainer': {
    ka: 'კონვერსია არის გამოყენებულების შეფარდება გახსნილებთან: ვინც საკმარისად მიუახლოვდა შეთავაზების დასანახად, რამდენი მათგანი შემოვიდა. სწორედ ეს ნაბიჯია ოპტიმიზაციის ღირსი.',
    en: 'Conversion is redemptions divided by reveals: of everyone who got close enough to see the offer, the share who actually walked in. That step is the one worth optimising.',
  },
  'analytics.noAccess': {
    ka: 'შენი როლი არ მოიცავს ანალიტიკაზე წვდომას.',
    en: "Your role doesn't include analytics access.",
  },
} as const

export type MessageKey = keyof typeof catalogue

const STORAGE_KEY = 'tq.merchant.locale'

type Ctx = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<Ctx | null>(null)

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  )
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Georgian is the default: the portal is for local business owners, and an
  // English-first default quietly signals the product is not for them.
  const [locale, setLocaleState] = useState<Locale>('ka')

  // Read after mount rather than during render so server and client markup
  // match on the first pass and React does not discard the tree.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'ka' || stored === 'en') setLocaleState(stored)
    } catch {
      // Private browsing or blocked storage: the default is fine.
    }
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference just will not persist; not worth surfacing.
    }
  }, [])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      interpolate(catalogue[key]?.[locale] ?? key, vars),
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
