import { useEffect, useState } from 'react'
import './App.css'
import hero from './assets/hero.png'

// Tbilisi, Freedom Square — placeholder anchor until real quest data lands.
const ANCHOR = { lat: 41.6934, lon: 44.8015, name: 'Freedom Square' }

type Fix = { lat: number; lon: number; accuracy: number }

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export default function App() {
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('Discover')

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available in this browser.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const away = fix
    ? Math.round(distanceMeters(fix.lat, fix.lon, ANCHOR.lat, ANCHOR.lon))
    : null

  const distanceLabel = away === null ? 'Locating you...' : away > 1500 ? `${(away / 1000).toFixed(1)} km away` : `${away} m away`

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Tbilisi Quest home"><span className="brand-mark"><span /></span><span>TBILISI<span>QUEST</span></span></a>
        <nav className="desktop-nav" aria-label="Main navigation">{['Discover', 'My quests', 'Rewards'].map((tab) => <button className={activeTab === tab ? 'nav-link active' : 'nav-link'} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
        <button className="profile-button" aria-label="Open profile"><span className="avatar">N</span><span className="profile-name">Nino</span><span className="chevron">⌄</span></button>
      </header>
      <div className="content" id="top">
        <section className="welcome-row"><div><p className="eyebrow">Saturday · 14 September</p><h1>Find something <em>unexpected.</em></h1><p className="intro">Turn a walk through Tbilisi into your next story.</p></div><div className="xp-summary"><strong>1,240</strong><span>XP earned</span><div className="xp-track"><i /></div><small>Level 4 · 260 XP to go</small></div></section>
        <section className="hero-card"><div className="hero-copy"><p className="eyebrow amber">FEATURED QUEST</p><h2>The city<br /><span>is your canvas.</span></h2><p>Three hidden drops. One afternoon. Start at the old town and follow the clues.</p><button className="primary-button" onClick={() => setActiveTab('My quests')}>Start exploring <span>→</span></button></div><div className="hero-art"><img src={hero} alt="Layered quest emblem" /><span className="orbit orbit-one" /><span className="orbit orbit-two" /></div><div className="hero-meta"><span><b>03</b> drops</span><span><b>~45</b> min</span><span><b>+500</b> XP</span></div></section>
        <div className="section-heading"><div><p className="eyebrow">MAKE YOUR MOVE</p><h2>Quests near you</h2></div><button className="text-button" onClick={() => setActiveTab('Discover')}>View all <span>↗</span></button></div>
        <section className="quest-grid">
          <article className="quest-card quest-card-purple"><div className="quest-icon">✦</div><div className="quest-top"><span className="rarity rare">RARE</span><span className="quest-time">◷ 25 min</span></div><h3>Hidden courtyards</h3><p>Find the quiet corners behind Sololaki's colourful doors.</p><footer><span className="distance-dot purple" />{distanceLabel}<span className="reward">+250 XP</span></footer></article>
          <article className="quest-card quest-card-cyan"><div className="quest-icon">⌁</div><div className="quest-top"><span className="rarity common">COMMON</span><span className="quest-time">◷ 15 min</span></div><h3>River rhythm</h3><p>Follow the Mtkvari and capture three changing reflections.</p><footer><span className="distance-dot cyan" />1.2 km away<span className="reward">+120 XP</span></footer></article>
          <article className="quest-card quest-card-gold"><div className="quest-icon">✧</div><div className="quest-top"><span className="rarity legendary">LEGENDARY</span><span className="quest-time">◷ 60 min</span></div><h3>Above the rooftops</h3><p>Climb higher for the view that locals keep to themselves.</p><footer><span className="distance-dot gold" />2.8 km away<span className="reward">+500 XP</span></footer></article>
        </section>
        <section className="lower-grid"><div className="nearby-panel"><div className="section-heading compact"><div><p className="eyebrow">YOUR POSITION</p><h2>Close to the action</h2></div><span className="live-pill"><i /> LIVE</span></div><div className="map-preview"><span className="map-label label-one">FREEDOM SQUARE</span><span className="map-label label-two">SOLOLAKI</span><span className="map-road road-one" /><span className="map-road road-two" /><span className="map-pin"><i /></span><span className="map-target" /></div><div className="location-status">{error ? <span className="error">{error}</span> : <><span className="status-icon">⌖</span><span><b>{fix ? 'You are on the map' : 'Finding your location'}</b><small>{fix ? `±${Math.round(fix.accuracy)} m accuracy · ${distanceLabel} from Freedom Square` : 'Allow location access to discover nearby drops.'}</small></span></>}</div></div><aside className="streak-panel"><p className="eyebrow">YOUR STREAK</p><div className="streak-number">04 <span>days</span></div><p>Keep exploring to grow your streak.</p><div className="streak-days"><b>M</b><b>T</b><b>W</b><b>T</b><b className="today">F</b><b>S</b><b>S</b></div><button className="outline-button" onClick={() => setActiveTab('Rewards')}>See rewards <span>→</span></button></aside></section>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">{['Discover', 'My quests', 'Rewards'].map((tab, index) => <button className={activeTab === tab ? 'mobile-link active' : 'mobile-link'} key={tab} onClick={() => setActiveTab(tab)}><span>{['⌂', '✦', '◇'][index]}</span>{tab}</button>)}</nav>
    </main>
  )
}
