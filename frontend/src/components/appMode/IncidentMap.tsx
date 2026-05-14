import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  location: string | null;
}

const DEFAULT_CENTER: L.LatLngExpression = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;
const FOCUS_ZOOM = 14;

async function geocode(query: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
    );
    const results = await resp.json();
    if (!results.length) return null;
    const { lat, lon, display_name } = results[0];
    return { lat: parseFloat(lat), lon: parseFloat(lon), displayName: display_name };
  } catch {
    return null;
  }
}

export function IncidentMap({ location }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!location || !mapInstanceRef.current) return;
    let cancelled = false;

    geocode(location).then((result) => {
      if (cancelled || !result || !mapInstanceRef.current) return;
      const map = mapInstanceRef.current;
      const latLng: L.LatLngExpression = [result.lat, result.lon];

      if (markerRef.current) map.removeLayer(markerRef.current);
      markerRef.current = L.marker(latLng)
        .addTo(map)
        .bindPopup(`<b>Incident Location</b><br>${result.displayName}`)
        .openPopup();
      map.setView(latLng, FOCUS_ZOOM, { animate: true });
    });

    return () => { cancelled = true; };
  }, [location]);

  return <div className="data-cell__map" ref={mapRef} />;
}
