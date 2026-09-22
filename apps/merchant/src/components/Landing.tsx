'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { CountUp, useReveal } from './landing-motion'
import '../app/landing.css'

/**
 * The page that has to make someone install an app they have never heard of,
 * usually standing in the street with a QR code they just scanned.
 *
 * Two rules it is written to:
 *
 *  1. Lead with the thing they get, not with what we built. Nobody wants a
 *     "location-based gamified discovery platform"; they want cheap coffee two
 *     streets away.
 *  2. Use real counts. "Hundreds of offers" is free to write and worth
 *     nothing. "6 places, 40 vouchers right now" is smaller, true, and cannot
 *     age into a lie -- and it goes up on its own as venues sign.
 */
export type PublicStats = {
  venues: number
  live_drops: number
  vouchers_today: number
}

const APK_URL =
  'https://expo.dev/artifacts/eas/00uHppxXSqcJuMUGneNT6C3_oHdlSzTGV3MmiwdIhg0.apk'

const CONTACT_EMAIL = 'hello@tbilisiquest.ge'

type Lang = 'ka' | 'en'

const COPY = {
  ka: {
    portal: 'ბიზნესებს',
    signIn: 'შესვლა',
    signUp: 'დაამატე შენი ბიზნესი',
    how: 'როგორ მუშაობს',
    heroEyebrow: 'უფასო აპლიკაცია · თბილისი',
    heroTitle: 'ყავა ნახევარ ფასად.',
    heroTitleAccent: 'ორი ქუჩის იქით.',
    heroBody:
      'ყოველდღე, 14:00-დან, ქალაქში ჩნდება ვაუჩერები. გახსენი რუკა, ნახე რა არის ახლოს და წაიღე — სანამ სხვა წაიღებს.',
    android: 'Android-ზე ჩამოტვირთვა',
    androidSub: 'APK · უფასო',
    ios: 'iPhone',
    iosSub: 'მალე',
    downloadNote: '13 წლიდან · რეკლამის გარეშე',
    statVenues: 'ადგილი',
    statDrops: 'აქტიური დროფი',
    statVouchers: 'ვაუჩერი ახლა',
    stepsEyebrow: 'როგორ მუშაობს',
    steps: [
      {
        n: '01',
        t: 'გახსენი რუკა',
        b: 'ყველა დროფი ერთ ეკრანზეა. ოქროსფერი ნიშნავს, რომ იქ რაღაც სერიოზული დევს.',
      },
      {
        n: '02',
        t: 'მიდი ადგილზე',
        b: 'ვაუჩერი მხოლოდ 20 მეტრის რადიუსში აიღება. სახლიდან არ გამოვა.',
      },
      {
        n: '03',
        t: 'აჩვენე სალაროსთან',
        b: 'დაასკანერე კოდი მაღაზიაში და ფასდაკლება მაშინვე მოქმედებს.',
      },
    ],
    rarityEyebrow: 'რა შეიძლება მოხვდეს',
    rarities: [
      { k: 'common', t: 'ჩვეულებრივი', b: '10-30% ფასდაკლება' },
      { k: 'rare', t: 'იშვიათი', b: '1+1 — ორი ერთის ფასად' },
      { k: 'legendary', t: 'ლეგენდარული', b: 'უფასო ან ნახევარ ფასად' },
    ],
    faqEyebrow: 'კითხვები',
    faq: [
      ['ფასიანია?', 'არა. აპლიკაცია უფასოა და ვაუჩერებიც უფასოდ აიღება.'],
      [
        'რატომ უნდა მივიდე ადგილზე?',
        'იმიტომ, რომ ეს არის მთელი აზრი — მაღაზიას მოჰყავს ხალხი, შენ იღებ ფასდაკლებას.',
      ],
      [
        'რამდენი ვაუჩერი შემიძლია?',
        'ერთ დროფზე ერთი. ყოველდღე ახლები ჩნდება.',
      ],
      [
        'ჩემი ადგილმდებარეობა ინახება?',
        'მხოლოდ მაშინ, როცა ვაუჩერს იყენებ — ეს არის მტკიცებულება, რომ მაღაზიაში იყავი. სხვა დროს არაფერს ვინახავთ.',
      ],
    ],
    bizEyebrow: 'ბიზნესებს',
    bizTitle: 'დღის შუა საათები ყველაზე მშვიდია. შეავსე ისინი.',
    bizBody:
      'დატოვე რამდენიმე ვაუჩერი 14:00-17:00-ზე და ნახე, რამდენი ადამიანი შემოვა. ხედავ ზუსტად: რამდენმა ნახა რუკაზე, რამდენი მოვიდა ახლოს, რამდენმა გამოიყენა. რეგისტრაცია უფასოა.',
    bizCta: 'დარეგისტრირდი',
    safetyEyebrow: 'უსაფრთხოება',
    safetyTitle: 'ფეხით. დღისით. ყურადღებით.',
    safetyBody:
      'აპლიკაცია ითიშება, თუ ჩქარა მოძრაობ — მანქანიდან თამაში არ გამოვა. მუშაობს მხოლოდ დღის საათებში. ყველა დროფი ნამდვილ მაღაზიასთანაა, სადაც კარი ქუჩიდან იღება.',
    privacy: 'კონფიდენციალურობა',
    terms: 'წესები',
    stickyCta: 'ჩამოტვირთე',
    toLight: 'ღია თემა',
    toDark: 'მუქი თემა',
  },
  en: {
    portal: 'For business',
    signIn: 'Sign in',
    signUp: 'Add your place',
    how: 'How it works',
    heroEyebrow: 'Free app · Tbilisi',
    heroTitle: 'Coffee at half price.',
    heroTitleAccent: 'Two streets away.',
    heroBody:
      'Every day from 14:00, vouchers appear around the city. Open the map, see what is near you, and take it before someone else does.',
    android: 'Download for Android',
    androidSub: 'APK · free',
    ios: 'iPhone',
    iosSub: 'Coming soon',
    downloadNote: 'Ages 13+ · no ads',
    statVenues: 'places',
    statDrops: 'live drops',
    statVouchers: 'vouchers right now',
    stepsEyebrow: 'How it works',
    steps: [
      {
        n: '01',
        t: 'Open the map',
        b: 'Every drop on one screen. Gold means something serious is sitting there.',
      },
      {
        n: '02',
        t: 'Walk to it',
        b: 'A voucher only opens within 20 metres. There is no claiming this one from the sofa.',
      },
      {
        n: '03',
        t: 'Scan at the counter',
        b: 'Scan the code inside the shop and the discount applies on the spot.',
      },
    ],
    rarityEyebrow: 'What you can find',
    rarities: [
      { k: 'common', t: 'Common', b: '10–30% off' },
      { k: 'rare', t: 'Rare', b: 'Buy one, get one' },
      { k: 'legendary', t: 'Legendary', b: 'Free, or half price' },
    ],
    faqEyebrow: 'Questions',
    faq: [
      ['Does it cost anything?', 'No. The app is free and so are the vouchers.'],
      [
        'Why do I have to go there?',
        'That is the whole point — the shop gets a customer, you get the discount.',
      ],
      [
        'How many can I take?',
        'One per drop. New ones appear every day.',
      ],
      [
        'Do you store my location?',
        'Only at the moment you redeem, as proof you were in the shop. Nothing is kept the rest of the time.',
      ],
    ],
    bizEyebrow: 'For business',
    bizTitle: 'Mid-afternoon is your quietest hour. Fill it.',
    bizBody:
      'Put a few vouchers into 14:00–17:00 and watch who walks in. You see exactly what happened: how many saw it on the map, how many came close, how many redeemed. Registration is free.',
    bizCta: 'Register your place',
    safetyEyebrow: 'Safety',
    safetyTitle: 'On foot. In daylight. Eyes up.',
    safetyBody:
      'The app cuts out above walking speed, so it cannot be played from a car. It runs in daylight hours only. Every drop sits at a real shop with a door onto the street.',
    privacy: 'Privacy',
    terms: 'Terms',
    stickyCta: 'Download',
    toLight: 'Light theme',
    toDark: 'Dark theme',
  },
} as const

export default function Landing({ stats }: { stats: PublicStats | null }) {
  const [lang, setLang] = useState<Lang>('ka')
  // Dark is the product's identity, so it is the default here as in the app.
  // Read the stored choice after mount rather than during render: the server
  // has no idea what this visitor picked, and guessing produces a hydration
  // mismatch and a flash of the wrong theme.
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const t = COPY[lang]

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('tq.theme')
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved)
        return
      }
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        setTheme('light')
      }
    } catch {
      // Private mode or blocked storage: dark is a fine answer.
    }
  }, [])

  function switchTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      window.localStorage.setItem('tq.theme', next)
    } catch {
      // Not worth failing a click over.
    }
  }

  // Below a handful of venues the numbers argue against us, so they stay off
  // until the map is worth boasting about.
  const showStats = stats != null && stats.venues >= 3

  // One per section: each fades up as it arrives rather than the whole page
  // animating at once, which reads as a loading screen.
  const statsReveal = useReveal<HTMLElement>()
  const howReveal = useReveal<HTMLElement>()
  const rarityReveal = useReveal<HTMLElement>()
  const bizReveal = useReveal<HTMLElement>()
  const faqReveal = useReveal<HTMLElement>()
  const safetyReveal = useReveal<HTMLElement>()

  return (
    <main
      className={[
        'landing',
        lang === 'ka' ? 'ka' : '',
        theme === 'light' ? 'light' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <span />
          </span>
          <span>
            TBILISI<span>QUEST</span>
          </span>
        </Link>

        <div className="top-actions">
          <a className="nav-link" href="#how">
            {t.how}
          </a>
          {/* Merchants get both doors in the corner: one for the shop that
              already has an account, one for the shop that does not. */}
          <Link className="nav-link" href="/login">
            {t.signIn}
          </Link>
          <Link className="portal-link" href="/login?mode=signup">
            {t.signUp}
          </Link>
          <button
            className="theme-toggle"
            onClick={switchTheme}
            aria-label={theme === 'dark' ? t.toLight : t.toDark}
            title={theme === 'dark' ? t.toLight : t.toDark}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          <div className="lang">
            <button
              className={lang === 'ka' ? 'on' : undefined}
              onClick={() => setLang('ka')}
            >
              ქარ
            </button>
            <button
              className={lang === 'en' ? 'on' : undefined}
              onClick={() => setLang('en')}
            >
              ENG
            </button>
          </div>
        </div>
      </header>

      {/* Two slow-drifting blooms behind everything. Pure decoration, so it
          is inert to pointers and disappears under prefers-reduced-motion. */}
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="content">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow amber">{t.heroEyebrow}</p>
            <h1>
              {t.heroTitle} <em>{t.heroTitleAccent}</em>
            </h1>
            <p className="intro">{t.heroBody}</p>

            <div className="stores">
              <a className="store-button" href={APK_URL}>
                <span>
                  {t.android}
                  <small>{t.androidSub}</small>
                </span>
              </a>
              <span className="store-button soon">
                <span>
                  {t.ios}
                  <small>{t.iosSub}</small>
                </span>
              </span>
            </div>
            <p className="download-note">{t.downloadNote}</p>
          </div>

          <div className="hero-art" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/store-icon.png" alt="" />
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
          </div>
        </section>

        {showStats && (
          <section
            className={`stats ${statsReveal.className}`}
            ref={statsReveal.ref}
          >
            <div>
              <b>
                <CountUp value={stats.venues} />
              </b>
              <span>{t.statVenues}</span>
            </div>
            <div>
              <b>
                <CountUp value={stats.live_drops} />
              </b>
              <span>{t.statDrops}</span>
            </div>
            <div>
              <b>
                <CountUp value={stats.vouchers_today} />
              </b>
              <span>{t.statVouchers}</span>
            </div>
          </section>
        )}

        <section id="how" className={howReveal.className} ref={howReveal.ref}>
          <p className="eyebrow">{t.stepsEyebrow}</p>
          <div className="steps">
            {t.steps.map((step) => (
              <article className="step" key={step.n}>
                <b>{step.n}</b>
                <h3>{step.t}</h3>
                <p>{step.b}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={rarityReveal.className} ref={rarityReveal.ref}>
          <p className="eyebrow">{t.rarityEyebrow}</p>
          <div className="rarities">
            {t.rarities.map((r) => (
              <article className={`rarity-card ${r.k}`} key={r.k}>
                <span className="dot" />
                <h3>{r.t}</h3>
                <p>{r.b}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className={`panel ${bizReveal.className}`}
          ref={bizReveal.ref}
        >
          <p className="eyebrow amber">{t.bizEyebrow}</p>
          <h2>{t.bizTitle}</h2>
          <p>{t.bizBody}</p>
          <div>
            <Link className="outline-button" href="/login">
              {t.bizCta} <span>→</span>
            </Link>
          </div>
        </section>

        <section className={faqReveal.className} ref={faqReveal.ref}>
          <p className="eyebrow">{t.faqEyebrow}</p>
          <div className="faq">
            {t.faq.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className={`panel safety ${safetyReveal.className}`}
          ref={safetyReveal.ref}
        >
          <p className="eyebrow">{t.safetyEyebrow}</p>
          <h2>{t.safetyTitle}</h2>
          <p>{t.safetyBody}</p>
        </section>
      </div>

      <footer className="footer">
        <span>© {new Date().getFullYear()} Gridly LLC</span>
        <nav>
          <Link href="/login">{t.portal}</Link>
          <a href="/privacy.html">{t.privacy}</a>
          <a href="/terms.html">{t.terms}</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
      </footer>

      {/* On a phone the download button scrolls away after the first screen,
          which is exactly where someone decides. This keeps it in reach. */}
      <a className="sticky-cta" href={APK_URL}>
        {t.stickyCta}
      </a>
    </main>
  )
}
