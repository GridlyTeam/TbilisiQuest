import { useEffect, useState } from 'react'
import './App.css'

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

  return (
    <main className="shell">
      <h1>Tbilisi Quest</h1>
      <p className="tagline">Deployment smoke test</p>

      <section className="card">
        <h2>Location</h2>
        {error && <p className="error">{error}</p>}
        {!fix && !error && <p className="muted">Waiting for a GPS fix…</p>}
        {fix && (
          <dl>
            <dt>Latitude</dt>
            <dd>{fix.lat.toFixed(5)}</dd>
            <dt>Longitude</dt>
            <dd>{fix.lon.toFixed(5)}</dd>
            <dt>Accuracy</dt>
            <dd>±{Math.round(fix.accuracy)} m</dd>
            <dt>{ANCHOR.name}</dt>
            <dd>
              {away !== null && away > 1500
                ? `${(away / 1000).toFixed(1)} km away`
                : `${away} m away`}
            </dd>
          </dl>
        )}
      </section>

      <p className="muted small">
        If you can read your own coordinates here on your phone, the whole
        pipeline works and the quest can be built on top.
      </p>
    </main>
  )
}
