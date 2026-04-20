import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Property } from '../types';
import { fmt } from './UI';

// Fix Leaflet default marker icon in React
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({
  iconUrl,
  shadowUrl,
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

function colorForScore(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function dealIcon(score: number) {
  const color = colorForScore(score);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22S28 24.5 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="7" fill="white" fill-opacity="0.9"/>
    <text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="${color}" font-family="monospace">${Math.round(score)}</text>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -38],
  });
}

function BoundsUpdater({ properties }: { properties: Property[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = properties.filter(p => p.lat && p.lng);
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid.map(p => [p.lat!, p.lng!]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [properties, map]);
  return null;
}

interface MapViewProps {
  properties: Property[];
  highlightedId: string | null;
  onPinClick: (id: string) => void;
  onUnderwrite: (id: string) => void;
}

export default function MapView({ properties, highlightedId, onPinClick, onUnderwrite }: MapViewProps) {
  const center: [number, number] = [32.7767, -96.797];

  return (
    <MapContainer
      center={center}
      zoom={11}
      style={{ height: '100%', width: '100%', background: '#0f172a' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <BoundsUpdater properties={properties} />
      {properties
        .filter(p => p.lat && p.lng)
        .map(p => (
          <Marker
            key={p.id}
            position={[p.lat!, p.lng!]}
            icon={dealIcon(p.dealScore)}
            eventHandlers={{ click: () => onPinClick(p.id) }}
          >
            <Popup className="strata-popup">
              <div style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', minWidth: 200, color: '#f1f5f9', fontFamily: 'sans-serif' }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 2, color: '#f1f5f9' }}>{p.address}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{p.city}, {p.state}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 10 }}>
                  {[
                    { l: 'Price', v: fmt.compact(p.price) },
                    { l: 'Deal Score', v: String(p.dealScore) },
                    { l: 'Cap Rate', v: fmt.pct(p.capRate) },
                    { l: 'Cash Flow', v: `+${fmt.currency(p.cashFlow)}/mo` },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', fontFamily: 'monospace' }}>{v}</div>
                    </div>
                  ))}
                </div>
                <button
                  style={{ width: '100%', background: '#c9a84c', color: '#0f172a', border: 'none', borderRadius: 6, padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => onUnderwrite(p.id)}
                >
                  Underwrite
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}
