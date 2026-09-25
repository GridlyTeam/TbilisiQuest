'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * A raster basemap rather than CARTO's vector style.
 *
 * The vector one left a blank canvas in the admin: the pin, the zoom controls
 * and the attribution all drew -- those are DOM -- while the tiles, which are
 * the WebGL canvas, never appeared, and MapLibre reported the style as loaded
 * and raised no error. Vector rendering needs the tile decoder, the glyph
 * server and the sprite sheet all to work; raster needs none of them, and this
 * map exists to let an operator see which side of a street they are pinning,
 * which a picture of the street does perfectly well.
 */
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© CARTO, © OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
}

/**
 * Click-to-place pin for a venue.
 *
 * Deliberately a real map rather than two number inputs: an operator placing a
 * venue needs to see which side of the street they are on. A venue pinned
 * across a carriageway sends every player over that road.
 */
export default function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)
  // Keeps the click handler from closing over a stale callback without
  // re-creating the map on every parent render.
  const handler = useRef(onChange)
  handler.current = onChange
  // The last position this component itself reported. Used to tell an
  // operator's own click apart from coordinates arriving from outside.
  const ours = useRef<{ lat: number; lng: number } | null>(null)
  // A blank map is indistinguishable from a slow one, and the operator cannot
  // read a console. If the tiles have not arrived the map says so itself.
  const [trouble, setTrouble] = useState<string | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return

    const instance = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: [lng, lat],
      zoom: 16,
    })

    instance.addControl(new NavigationControl(), 'top-right')

    // The map is built before the browser has necessarily laid the container
    // out -- inside a form that was just revealed, the div can still be 0px
    // high at this point. MapLibre sizes its canvas once, at construction, so
    // it would stay 0x0 forever: the tiles never appear while the marker,
    // which is an absolutely positioned DOM element rather than part of the
    // canvas, shows perfectly. Watching the container and resizing is what
    // makes it survive being rendered inside a collapsible form.
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(container.current)
    instance.once('load', () => instance.resize())

    // ResizeObserver covers a container that changes size later, but not one
    // that was already its final size before the map existed and so never
    // "changes" at all. Nudging it across the next few frames costs nothing
    // and covers both.
    const nudges = [
      requestAnimationFrame(() => instance.resize()),
      window.setTimeout(() => instance.resize(), 120),
      window.setTimeout(() => instance.resize(), 600),
    ]

    // Nothing drawn after a few seconds means the style or its tiles did not
    // arrive. Report it rather than leaving a white rectangle.
    const watchdog = window.setTimeout(() => {
      if (!instance.isStyleLoaded()) {
        const canvas = instance.getCanvas()
        setTrouble(
          `Map tiles did not load (canvas ${canvas.width}x${canvas.height}).`,
        )
      }
    }, 6000)

    instance.once('idle', () => setTrouble(null))

    // Surface a failed style or blocked tile request instead of leaving a
    // blank rectangle and no explanation.
    instance.on('error', (event) => {
      const message = event.error?.message ?? 'unknown map error'
      console.warn('[LocationPicker] map error', message)
      setTrouble(message)
    })

    marker.current = new Marker({ color: '#4C3A8C', draggable: true })
      .setLngLat([lng, lat])
      .addTo(instance)

    marker.current.on('dragend', () => {
      const pos = marker.current!.getLngLat()
      ours.current = { lat: pos.lat, lng: pos.lng }
      handler.current(pos.lat, pos.lng)
    })

    instance.on('click', (event: MapMouseEvent) => {
      marker.current?.setLngLat(event.lngLat)
      ours.current = { lat: event.lngLat.lat, lng: event.lngLat.lng }
      handler.current(event.lngLat.lat, event.lngLat.lng)
    })

    map.current = instance

    return () => {
      cancelAnimationFrame(nudges[0])
      window.clearTimeout(nudges[1])
      window.clearTimeout(nudges[2])
      window.clearTimeout(watchdog)
      observer.disconnect()
      instance.remove()
      map.current = null
    }
    // Initial position only: later changes move the marker below rather than
    // rebuilding the map, which would throw away the operator's zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    marker.current?.setLngLat([lng, lat])

    // Follow the pin when the coordinates came from somewhere other than this
    // map. Opening a second venue moved the marker and left the camera on the
    // first one, so the pin sat off-screen and the operator was looking at an
    // empty street with no way to tell where it had gone.
    //
    // A click of their own is left alone: recentring under the cursor every
    // time they placed a pin would fight them while they worked.
    const placed = ours.current
    const isOurs =
      placed != null &&
      Math.abs(placed.lat - lat) < 1e-9 &&
      Math.abs(placed.lng - lng) < 1e-9

    if (!isOurs) {
      map.current?.easeTo({ center: [lng, lat], duration: 400 })
    }
  }, [lat, lng])

  return (
    <div className="relative">
      <div
        ref={container}
        className="h-80 w-full overflow-hidden rounded-xl border border-line"
      />
      {trouble && (
        <p className="absolute left-3 right-3 top-3 rounded-lg border border-danger bg-danger px-3 py-2 text-xs font-medium text-danger-ink shadow-sm">
          {trouble}
        </p>
      )}

      <button
        type="button"
        onClick={() => map.current?.easeTo({ center: [lng, lat], zoom: 17, duration: 400 })}
        className="absolute bottom-3 left-3 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-sm hover:border-ink"
      >
        Show pin
      </button>
    </div>
  )
}
