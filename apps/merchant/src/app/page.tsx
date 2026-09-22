'use client'

import { useState } from 'react'
import Link from 'next/link'

import './landing.css'

/**
 * The public front door.
 *
 * Everything lives behind one address now: this page for players, /login for
 * merchants and operators. The Vite app that used to serve this separately is
 * gone -- two codebases rendering the same brand was one too many.
 *
 * Written for someone who has just been handed a QR code in the street.
 * Georgian first, because that is who this is for.
 */

// Each EAS build publishes a new artifact URL, so this moves with every
// release. When the download goes on a poster it should become a permanent
// path backed by R2 storage.
const APK_URL =
  'https://expo.dev/artifacts/eas/hxMoEyk2BWZdGEEBrjlU8wGSnkKQqeyPyVEwExJv3R8.apk'

const CONTACT_EMAIL = 'hello@tbilisiquest.ge'

type Lang = 'ka' | 'en'

const COPY = {
  ka: {
    portal: 'ბიზნეს პორტალი',
    how: 'როგორ მუშაობს',
    heroEyebrow: 'თბილისი · ყოველდღე 14:00-დან',
    heroTitle: 'ქალაქი სავსეა',
    heroTitleAccent: 'ფასდაკლებებით.',
    heroBody:
      'იპოვე დროფები რუკაზე, მიდი ადგილზე და აიღე ვაუჩერი. კაფეები, ბარები, სალონები - ნამდვილი ფასდაკლებები ნამდვილ ადგილებში.',
    android: 'Android აპლიკაცია',
    androidSub: 'ჩამოტვირთე APK',
    ios: 'iPhone',
    iosSub: 'მალე',
    downloadNote: 'უფასო · 13 წლიდან',
    stepsEyebrow: 'სამი ნაბიჯი',
    steps: [
      { n: '01', t: 'იპოვე', b: 'რუკაზე ჩანს ყველა აქტიური დროფი ქალაქში. ოქროსფერი ყველაზე იშვიათია.' },
      { n: '02', t: 'მიდი', b: 'ვაუჩერის აღება მხოლოდ ადგილზე შეიძლება - 20 მეტრის რადიუსში.' },
      { n: '03', t: 'გამოიყენე', b: 'მაღაზიაში დაასკანერე კოდი სალაროსთან და ფასდაკლება შენია.' },
    ],
    rarityEyebrow: 'იშვიათობა',
    rarities: [
      { k: 'common', t: 'ჩვეულებრივი', b: 'პროცენტული ფასდაკლება' },
      { k: 'rare', t: 'იშვიათი', b: '1+1 შეთავაზებები' },
      { k: 'legendary', t: 'ლეგენდარული', b: 'უფასო ან მსხვილი ფასდაკლება' },
    ],
    bizEyebrow: 'ბიზნესებს',
    bizTitle: 'მოიყვანე ხალხი მაშინ, როცა დარბაზი ცარიელია.',
    bizBody:
      'დღის შუა საათები ყველაზე მშვიდია. დატოვე რამდენიმე ვაუჩერი ამ დროისთვის და ნახე, რამდენი ადამიანი შემოვა. ხედავ რეალურ სტატისტიკას: რამდენმა ნახა, რამდენი მოვიდა, რამდენმა გამოიყენა.',
    bizCta: 'დაგვიკავშირდი',
    bizPortal: 'პორტალში შესვლა',
    safetyEyebrow: 'უსაფრთხოება',
    safetyTitle: 'ფეხით. დღისით. ყურადღებით.',
    safetyBody:
      'აპლიკაცია პაუზდება, თუ ჩქარა მოძრაობ - მანქანაში თამაში არ გამოვა. მუშაობს მხოლოდ დღის საათებში. ყველა დროფი ნამდვილ მაღაზიასთანაა, სადაც კარი ქუჩიდან იღება.',
    privacy: 'კონფიდენციალურობა',
    terms: 'წესები',
  },
  en: {
    portal: 'Business portal',
    how: 'How it works',
    heroEyebrow: 'Tbilisi · every day from 14:00',
    heroTitle: 'The city is full of',
    heroTitleAccent: 'discounts.',
    heroBody:
      'Find drops on the map, walk to them, claim a voucher. Cafés, bars, salons — real discounts in real places.',
    android: 'Android app',
    androidSub: 'Download APK',
    ios: 'iPhone',
    iosSub: 'Coming soon',
    downloadNote: 'Free · ages 13+',
    stepsEyebrow: 'Three steps',
    steps: [
      { n: '01', t: 'Find', b: 'The map shows every live drop in the city. Gold ones are the rarest.' },
      { n: '02', t: 'Walk', b: 'A voucher can only be claimed on the spot — within 20 metres.' },
      { n: '03', t: 'Redeem', b: 'Scan the code at the counter inside the shop and the discount is yours.' },
    ],
    rarityEyebrow: 'Rarity',
    rarities: [
      { k: 'common', t: 'Common', b: 'Percentage off' },
      { k: 'rare', t: 'Rare', b: 'Buy one get one' },
      { k: 'legendary', t: 'Legendary', b: 'Free item or a major discount' },
    ],
    bizEyebrow: 'For business',
    bizTitle: 'Fill the room when it would otherwise be empty.',
    bizBody:
      'Mid-afternoon is the quietest part of your day. Put a few vouchers into that window and watch who walks in. You see what actually happened: how many saw it, how many came close, how many redeemed.',
    bizCta: 'Get in touch',
    bizPortal: 'Sign in to the portal',
    safetyEyebrow: 'Safety',
    safetyTitle: 'On foot. In daylight. Eyes up.',
    safetyBody:
      'The app pauses above walking speed, so it cannot be played from a car. It runs in daylight hours only. Every drop sits at a real shop with a door onto the street.',
    privacy: 'Privacy',
    terms: 'Terms',
  },
} as const

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>('ka')
  const t = COPY[lang]

  return (
    <main className="landing">
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
          <Link className="portal-link" href="/login">
            {t.portal}
          </Link>
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
              {/* Kept visible rather than hidden: "coming soon" is information,
                  an absent button is a question. */}
              <span className="store-button soon">
                <span>
                  {t.ios}
                  <small>{t.iosSub}</small>
                </span>
              </span>
            </div>
            <p className="download-note">{t.downloadNote}</p>
          </div>

          <div className="hero-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/store-icon.png" alt="" />
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
          </div>
        </section>

        <section id="how">
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

        <section>
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

        <section className="panel">
          <p className="eyebrow amber">{t.bizEyebrow}</p>
          <h2>{t.bizTitle}</h2>
          <p>{t.bizBody}</p>
          <div>
            <Link className="outline-button" href="/login">
              {t.bizPortal} <span>→</span>
            </Link>
          </div>
        </section>

        <section className="panel safety">
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
          <a href={`mailto:${CONTACT_EMAIL}`}>{t.bizCta}</a>
        </nav>
      </footer>
    </main>
  )
}
