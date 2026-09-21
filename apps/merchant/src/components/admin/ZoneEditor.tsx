'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { createSafetyZone, setZoneActive } from '@/lib/admin-actions'

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const TBILISI: [number, number] = [44.7935, 41.6998]

export type ZoneShape = {
  id: string
  kind: string
  name: string | null
  buffer_m: number
  is_active: boolean
  geojson: string
}

const KINDS = [
  { value: 'roadway', label: 'Roadway', colour: '#C2410C', buffer: 15 },
  { value: 'rail', label: 'Rail line', colour: '#7C2D12', buffer: 25 },
  { value: 'embankment', label: 'Embankment', colour: '#9A3412', buffer: 10 },
  { value: 'construction', label: 'Construction', colour: '#A16207', buffer: 10 },
  { value: 'steep', label: 'Steep / stairs', colour: '#4C3A8C', buffer: 5 },
  { value: 'water', label: 'Water', colour: '#1D4ED8', buffer: 10 },
  { value: 'private', label: 'Private land', colour: '#6B7280', buffer: 0 },
  { value: 'religious', label: 'Religious site', colour: '#6D28D9', buffer: 5 },
  { value: 'cemetery', label: 'Cemetery', colour: '#374151', buffer: 5 },
  { value: 'school', label: 'School', colour: '#059669', buffer: 10 },
  { value: 'hospital', label: 'Hospital', colour: '#DC2626', buffer: 10 },
] as const

/**
 * Draw exclusion zones by clicking vertices on the map.
 *
 * A polygon is closed automatically on save, and the ring is written back as
 * WKT because that is what ST_GeogFromText takes. Three vertices is the
 * minimum for an area; anything less is a line and would exclude nothing.
 *
 * A dedicated drawing library would add gestures we do not need here — an
 * operator tracing a road once is better served by something that cannot
 * misbehave than by something with edit handles.
 */
export default function ZoneEditor({ zones }: { zones: ZoneShape[] }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const [points, setPoints] = useState<Array<[number, number]>>([])
  const [kind, setKind] = useState<string>('roadway')
  const [name, setName] = useState('')
  const [buffer, setBuffer] = useState(15)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pointsRef = useRef(points)
  pointsRef.current = points

  useEffect(() => {
    if (!container.current || map.current) return

    const instance = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: TBILISI,
      zoom: 13,
    })
    instance.addControl(new NavigationControl(), 'top-right')

    instance.on('click', (event: MapMouseEvent) => {
      setPoints((prev) => [...prev, [event.lngLat.lng, event.lngLat.lat]])
    })

    instance.on('load', () => {
      // Existing zones, so an operator can see what is already covered.
      instance.addSource('zones', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: zones
            .filter((z) => z.is_active)
            .map((z) => ({
              type: 'Feature' as const,
              geometry: JSON.parse(z.geojson),
              properties: { kind: z.kind },
            })),
        },
      })
      instance.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: { 'fill-color': '#C2410C', 'fill-opacity': 0.25 },
      })
      instance.addLayer({
        id: 'zones-line',
        type: 'line',
        source: 'zones',
        paint: { 'line-color': '#C2410C', 'line-width': 2 },
      })

      // The polygon being drawn right now.
      instance.addSource('draft', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instance.addLayer({
        id: 'draft-fill',
        type: 'fill',
        source: 'draft',
        paint: { 'fill-color': '#4C3A8C', 'fill-opacity': 0.3 },
      })
      instance.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        paint: { 'line-color': '#4C3A8C', 'line-width': 2, 'line-dasharray': [2, 1] },
      })
      instance.addLayer({
        id: 'draft-points',
        type: 'circle',
        source: 'draft',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#4C3A8C',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      })
    })

    map.current = instance
    return () => {
      instance.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw the draft whenever a vertex is added or cleared.
  useEffect(() => {
    const source = map.current?.getSource('draft') as GeoJSONSource | undefined
    if (!source) return

    const features: GeoJSON.Feature[] = points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p },
      properties: {},
    }))

    if (points.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] },
        properties: {},
      })
    } else if (points.length === 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: points },
        properties: {},
      })
    }

    source.setData({ type: 'FeatureCollection', features })
  }, [points])

  const save = useCallback(async () => {
    if (points.length < 3) {
      setError('A zone needs at least three points.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // WKT wants the ring closed explicitly and longitude first.
      const ring = [...points, points[0]]
        .map(([lng, lat]) => `${lng} ${lat}`)
        .join(', ')

      await createSafetyZone({
        kind,
        name: name || KINDS.find((k) => k.value === kind)!.label,
        wkt: `POLYGON((${ring}))`,
        bufferM: buffer,
      })

      setPoints([])
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }, [points, kind, name, buffer])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Safety zones</h1>
        <p className="mt-0.5 text-sm text-muted">
          Drops can never be placed inside these, and a claim fails if the
          player is standing in one. Click the map to trace a shape.
        </p>
      </div>

      {zones.length === 0 && (
        <div className="rounded-lg border border-warn-line bg-warn px-4 py-3 text-sm text-warn-ink">
          No zones drawn yet. Until the main roads are covered, nothing stops a
          drop being placed on a carriageway. Start with Rustaveli and
          Agmashenebeli.
        </div>
      )}

      <div
        ref={container}
        className="h-[480px] w-full overflow-hidden rounded-xl border border-line"
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <label className="space-y-1">
          <span className="block text-xs text-muted">Kind</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value)
              const preset = KINDS.find((k) => k.value === e.target.value)
              if (preset) setBuffer(preset.buffer)
            }}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex-1 space-y-1">
          <span className="block text-xs text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rustaveli Ave carriageway"
            className={`${inputClass} w-full`}
          />
        </label>

        <label className="space-y-1">
          <span className="block text-xs text-muted">Buffer (m)</span>
          <input
            type="number"
            min={0}
            max={200}
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            className={`${inputClass} w-24`}
          />
        </label>

        <span className="text-xs tabular-nums text-faint">
          {points.length} point{points.length === 1 ? '' : 's'}
        </span>

        <button
          onClick={() => setPoints((p) => p.slice(0, -1))}
          disabled={points.length === 0}
          className="rounded-lg border border-line px-3 py-2 text-sm text-muted disabled:opacity-40"
        >
          Undo
        </button>
        <button
          onClick={() => setPoints([])}
          disabled={points.length === 0}
          className="rounded-lg border border-line px-3 py-2 text-sm text-muted disabled:opacity-40"
        >
          Clear
        </button>
        <button
          onClick={save}
          disabled={busy || points.length < 3}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save zone'}
        </button>
      </div>

      {error && <p className="text-sm text-danger-ink">{error}</p>}

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {zones.map((zone) => (
          <li key={zone.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className="h-6 w-1 rounded-full"
              style={{
                backgroundColor:
                  KINDS.find((k) => k.value === zone.kind)?.colour ?? '#6B7280',
              }}
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-ink">
                {zone.name ?? zone.kind}
              </span>
              <p className="text-xs text-muted">
                {zone.kind} · {zone.buffer_m} m buffer
              </p>
            </div>
            <button
              onClick={() => setZoneActive(zone.id, !zone.is_active)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                zone.is_active
                  ? 'bg-live text-live-ink'
                  : 'bg-canvas text-muted'
              }`}
            >
              {zone.is_active ? 'Active' : 'Disabled'}
            </button>
          </li>
        ))}
        {zones.length === 0 && (
          <li className="p-6 text-center text-sm text-muted">No zones yet.</li>
        )}
      </ul>
    </div>
  )
}

const inputClass =
  'rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-indigo'
