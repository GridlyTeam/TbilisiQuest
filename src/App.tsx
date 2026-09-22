import { useState } from 'react'
import './App.css'

/**
 * The public page: what this is, and a button that installs it.
 *
 * Written for someone who has just been handed a QR code in the street and has
 * about eight seconds of patience. Georgian first, because that is who this is
 * for; English underneath for visitors rather than as an equal.
 *
 * Deliberately not a dashboard. The previous version showed a level, an XP
 * total and a streak, all invented -- a page that displays fake numbers as
 * though they were live is a problem the moment a merchant reads it.
 */

// Each EAS build publishes a new artifact URL, so this moves with every
// release. When the download goes on a poster, this should become a permanent
// path on the site backed by R2 storage.
const APK_URL =
  'https://expo.dev/artifacts/eas/hxMoEyk2BWZdGEEBrjlU8wGSnkKQqeyPyVEwExJv3R8.apk'

const CONTACT_EMAIL = 'hello@tbilisiquest.ge'

type Lang = 'ka' | 'en'

const COPY = {
  ka: {
    nav: ['როგორ მუშაობს', 'ბიზნესებს', 'ჩამოტვირთვა'],
    heroEyebrow: 'თბილისი · ყოველდღე 14:00-დან',
    heroTitle: 'ქალაქი სავსეა',
    heroTitleAccent: 'ფასდაკლებებით.',
    heroBody:
      'იპოვე დროფები რუკაზე, მიდი ადგილზე და აიღე ვაუჩერი. კაფეები, ბარები, სალონები - ნამდვილი ფასდაკლებები ნამდვილ ადგილებში.',
    download: 'ჩამოტვირთე აპლიკაცია',
    downloadNote: 'Android · უფასო · 13 წლიდან',
    stepsEyebrow: 'სამი ნაბიჯი',
    steps: [
      {
        n: '01',
        t: 'იპოვე',
        b: 'რუკაზე ჩანს ყველა აქტიური დროფი ქალაქში. ოქროსფერი ყველაზე იშვიათია.',
      },
      {
        n: '02',
        t: 'მიდი',
        b: 'ვაუჩერის აღება მხოლოდ ადგილზე შეიძლება - 20 მეტრის რადიუსში.',
      },
      {
        n: '03',
        t: 'გამოიყენე',
        b: 'მაღაზიაში დაასკანერე კოდი სალაროსთან და ფასდაკლება შენია.',
      },
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
    safetyEyebrow: 'უსაფრთხოება',
    safetyTitle: 'ფეხით. დღისით. ყურადღებით.',
    safetyBody:
      'აპლიკაცია პაუზდება, თუ ჩქარა მოძრაობ - მანქანაში თამაში არ გამოვა. მუშაობს მხოლოდ დღის საათებში. ყველა დროფი ნამდვილ მაღაზიასთანაა, სადაც კარი ქუჩიდან იღება.',
    footerLinks: ['კონფიდენციალურობა', 'წესები'],
  },
  en: {
    nav: ['How it works', 'For business', 'Download'],
    heroEyebrow: 'Tbilisi · every day from 14:00',
    heroTitle: 'The city is full of',
    heroTitleAccent: 'discounts.',
    heroBody:
      'Find drops on the map, walk to them, claim a voucher. Cafés, bars, salons — real discounts in real places.',
    download: 'Download the app',
    downloadNote: 'Android · free · ages 13+',
    stepsEyebrow: 'Three steps',
    steps: [
      {
        n: '01',
        t: 'Find',
        b: 'The map shows every live drop in the city. Gold ones are the rarest.',
      },
      {
        n: '02',
        t: 'Walk',
        b: 'A voucher can only be claimed on the spot — within 20 metres.',
      },
      {
        n: '03',
        t: 'Redeem',
        b: 'Scan the code at the counter inside the shop and the discount is yours.',
      },
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
    safetyEyebrow: 'Safety',
    safetyTitle: 'On foot. In daylight. Eyes up.',
    safetyBody:
      'The app pauses above walking speed, so it cannot be played from a car. It runs in daylight hours only. Every drop sits at a real shop with a door onto the street.',
    footerLinks: ['Privacy', 'Terms'],
  },
} as const

export default function App() {
  const [lang, setLang] = useState<Lang>('ka')
  const t = COPY[lang]

  return (
    <main className="site">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Tbilisi Quest">
          <span className="brand-mark">
            <span />
          </span>
          <span>
            TBILISI<span>QUEST</span>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="Main">
          <a className="nav-link" href="#how">
            {t.nav[0]}
          </a>
          <a className="nav-link" href="#business">
            {t.nav[1]}
          </a>
          <a className="nav-link" href="#get">
            {t.nav[2]}
          </a>
        </nav>

        <div className="lang" role="group" aria-label="Language">
          <button
            className={lang === 'ka' ? 'lang-on' : undefined}
            onClick={() => setLang('ka')}
          >
            ქარ
          </button>
          <button
            className={lang === 'en' ? 'lang-on' : undefined}
            onClick={() => setLang('en')}
          >
            ENG
          </button>
        </div>
      </header>

      <div className="content" id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow amber">{t.heroEyebrow}</p>
            <h1>
              {t.heroTitle} <em>{t.heroTitleAccent}</em>
            </h1>
            <p className="intro">{t.heroBody}</p>

            <a className="primary-button" href={APK_URL} id="get">
              {t.download} <span>↓</span>
            </a>
            <p className="download-note">{t.downloadNote}</p>
          </div>

          <div className="hero-art">
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

        <section className="panel" id="business">
          <p className="eyebrow amber">{t.bizEyebrow}</p>
          <h2>{t.bizTitle}</h2>
          <p>{t.bizBody}</p>
          <a className="outline-button" href={`mailto:${CONTACT_EMAIL}`}>
            {t.bizCta} <span>→</span>
          </a>
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
          <a href="/privacy">{t.footerLinks[0]}</a>
          <a href="/terms">{t.footerLinks[1]}</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
      </footer>
    </main>
  )
}
