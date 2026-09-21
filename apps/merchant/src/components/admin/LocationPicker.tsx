'use client'

import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, type MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

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

  useEffect(() => {
    if (!container.current || map.current) return

    const instance = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: [lng, lat],
      zoom: 16,
    })

    instance.addControl(new NavigationControl(), 'top-right')

    marker.current = new Marker({ color: '#4C3A8C', draggable: true })
      .setLngLat([lng, lat])
      .addTo(instance)

    marker.current.on('dragend', () => {
      const pos = marker.current!.getLngLat()
      handler.current(pos.lat, pos.lng)
    })

    instance.on('click', (event: MapMouseEvent) => {
      marker.current?.setLngLat(event.lngLat)
      handler.current(event.lngLat.lat, event.lngLat.lng)
    })

    map.current = instance

    return () => {
      instance.remove()
      map.current = null
    }
    // Initial position only: later changes move the marker below rather than
    // rebuilding the map, which would throw away the operator's zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    marker.current?.setLngLat([lng, lat])
  }, [lat, lng])

  return (
    <div
      ref={container}
      className="h-80 w-full overflow-hidden rounded-xl border border-line"
    />
  )
}
