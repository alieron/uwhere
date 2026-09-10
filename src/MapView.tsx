import { useId, useState } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { formatTime } from './waterloo';

export interface MapMarker {
  lat:        number;
  lng:        number;
  label:      string;
  color:      string;
  venue:      string;
  courseCode: string;
  component: string;
  startTime:  string;
  endTime:    string;
}

interface Cluster {
  lat:     number;
  lng:     number;
  markers: MapMarker[];
}

interface Props {
  markers: MapMarker[];
  bottomInset?: number;
}

interface OpenPopup extends Cluster {
  offset: number;
  source: MapMarker[];
}

const WATERLOO_CENTER = { latitude: 43.4723, longitude: -80.5449 };

/** Cluster markers whose screen distance is within `thresholdPx` pixels. */
function cluster(markers: MapMarker[], map: MapRef | null): Cluster[] {
  const clusters: Cluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < markers.length; i++) {
    if (used.has(i)) continue;
    const group: MapMarker[] = [markers[i]];
    used.add(i);
    for (let j = i + 1; j < markers.length; j++) {
      if (used.has(j)) continue;
      const first = map?.project([markers[i].lng, markers[i].lat]);
      const next = map?.project([markers[j].lng, markers[j].lat]);
      if (first && next && Math.hypot(first.x - next.x, first.y - next.y) < 40) {
        group.push(markers[j]);
        used.add(j);
      }
    }
    const lat = group.reduce((sum, marker) => sum + marker.lat, 0) / group.length;
    const lng = group.reduce((sum, marker) => sum + marker.lng, 0) / group.length;
    clusters.push({ lat, lng, markers: group });
  }
  return clusters;
}

function initials(label: string): string {
  return label.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
}

function Pin({ color, label }: { color: string; label: string }) {
  const filterId = useId();
  return (
    <svg width="40" height="48" viewBox="-4 -4 40 48" aria-hidden="true">
      <filter id={filterId}><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.45)" /></filter>
      <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 24 16 24S32 28 32 16C32 7.2 24.8 0 16 0z" fill={color} filter={`url(#${filterId})`} />
      <circle cx="16" cy="16" r="10" fill="rgba(0,0,0,0.22)" />
      <text x="16" y="20.5" textAnchor="middle" fontFamily="Inter,Arial,sans-serif" fontSize="9" fontWeight="700" fill="white">
        {initials(label)}
      </text>
    </svg>
  );
}

function ClusterIcon({ markers }: { markers: MapMarker[] }) {
  const filterId = useId();
  const count = markers.length;
  const size = count === 2 ? 36 : count <= 4 ? 42 : 48;
  const radius = size / 2;
  const inner = radius * 0.55;
  const perColor = markers.reduce<Record<string, number>>((counts, marker) => {
    counts[marker.color] = (counts[marker.color] ?? 0) + 1;
    return counts;
  }, {});
  let startAngle = -Math.PI / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <filter id={filterId}><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" /></filter>
      <g filter={`url(#${filterId})`}>
        {Object.entries(perColor).map(([color, countForColor]) => {
          if (Object.keys(perColor).length === 1) {
            return <circle key={color} cx={radius} cy={radius} r={radius - 2} fill={color} opacity="0.92" />;
          }
          const angle = (countForColor / markers.length) * 2 * Math.PI;
          const x1 = radius + (radius - 2) * Math.cos(startAngle);
          const y1 = radius + (radius - 2) * Math.sin(startAngle);
          const x2 = radius + (radius - 2) * Math.cos(startAngle + angle);
          const y2 = radius + (radius - 2) * Math.sin(startAngle + angle);
          const path = `M${radius},${radius} L${x1},${y1} A${radius - 2},${radius - 2} 0 ${angle > Math.PI ? 1 : 0},1 ${x2},${y2} Z`;
          startAngle += angle;
          return <path key={color} d={path} fill={color} opacity="0.92" />;
        })}
      </g>
      <circle cx={radius} cy={radius} r={inner} fill="oklch(0.1913 0 0)" />
      <text x={radius} y={radius + 4} textAnchor="middle" fontFamily="Inter,Arial,sans-serif" fontSize={count > 9 ? 11 : 13} fontWeight="700" fill="oklch(0.9882 0.0041 157.18)">
        {count}
      </text>
    </svg>
  );
}

function EdgeIcon({ markers, angle }: { markers: MapMarker[]; angle: number }) {
  const gradientId = useId();
  const colors = [...new Set(markers.map(marker => marker.color))];

  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          {colors.flatMap((color, index) => [
            <stop key={`${color}-start`} offset={`${index / colors.length * 100}%`} stopColor={color} />,
            <stop key={`${color}-end`} offset={`${(index + 1) / colors.length * 100}%`} stopColor={color} />,
          ])}
        </linearGradient>
      </defs>
      <g transform={`rotate(${angle} 18 18)`}>
        <path d="M18 2L31 30L18 24L5 30Z" fill={`url(#${gradientId})`} stroke="white" strokeWidth="2" strokeLinejoin="round" />
        {markers.length > 1 && (
          <>
            <circle cx="18" cy="23" r="7" fill="oklch(0.1913 0 0)" stroke="white" strokeWidth="1.5" />
            <text x="18" y="23" textAnchor="middle" dominantBaseline="central" fontFamily="Inter,Arial,sans-serif" fontSize="10" fontWeight="700" fill="white" transform={`rotate(${-angle} 18 23)`}>
              {markers.length}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}

function PopupContent({ markers }: { markers: MapMarker[] }) {
  if (markers.length === 1) {
    return (
      <div className="min-w-[170px] font-sans">
        {markers.map((marker, index) => (
          <div key={`${marker.label}-${marker.courseCode}-${marker.startTime}`}>
            {index > 0 && <hr className="my-[7px] border-border" />}
            <div className="mb-[5px] flex items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: marker.color }} />
              <strong className="text-[13px] text-foreground">{marker.label}</strong>
            </div>
            <div className="text-xs leading-[1.7] text-muted-foreground">
              <div>{marker.venue}</div>
              <div>{marker.courseCode} - {marker.component}</div>
              <div>{formatTime(marker.startTime)}-{formatTime(marker.endTime)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const byVenue = markers.reduce<Record<string, MapMarker[]>>((venues, marker) => {
    (venues[marker.venue] ??= []).push(marker);
    return venues;
  }, {});

  return (
    <div className="min-w-[180px] font-sans">
      {Object.entries(byVenue).map(([venue, venueMarkers], index) => (
        <div key={venue}>
          {index > 0 && <hr className="my-1.5 border-border" />}
          <div className="mb-1 text-[11px] text-muted-foreground">{venue}</div>
          {venueMarkers.map(marker => (
            <div key={`${marker.label}-${marker.courseCode}-${marker.startTime}`} className="mb-[3px] flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: marker.color }} />
              <span className="text-xs text-foreground">{marker.label}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{marker.courseCode}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function edgePosition(map: MapRef, targetLat: number, targetLng: number, bottomInset: number) {
  const container = map.getContainer();
  const bounds = container.getBoundingClientRect();
  const dockTop = document.querySelector<HTMLElement>('.schedule-dock')?.getBoundingClientRect().top;
  const dock = document.querySelector<HTMLElement>('.schedule-dock')?.getBoundingClientRect();
  const inset = Math.min(dockTop === undefined ? bottomInset : Math.max(0, bounds.bottom - dockTop), bounds.height - 60);
  const visibleHeight = bounds.height - inset;
  const centerX = bounds.width / 2;
  const centerY = visibleHeight / 2;
  const target = map.project([targetLng, targetLat]);
  const coveredByDock = Boolean(dock
    && target.x >= dock.left - bounds.left
    && target.x <= dock.right - bounds.left
    && target.y >= dock.top - bounds.top);
  const dx = target.x - centerX;
  const dy = target.y - centerY;
  const padding = 30;
  const scale = Math.min(
    (centerX - padding) / Math.max(Math.abs(dx), 0.001),
    (centerY - padding) / Math.max(Math.abs(dy), 0.001),
  );
  const position = map.unproject([centerX + dx * scale, centerY + dy * scale]);
  return {
    visible: target.x >= 0 && target.x <= bounds.width && target.y >= 0 && target.y <= bounds.height && !coveredByDock,
    lat: position.lat,
    lng: position.lng,
    angle: Math.atan2(dy, dx) * 180 / Math.PI + 90,
  };
}

export default function MapView({ markers, bottomInset = 0 }: Props) {
  const [map, setMap] = useState<MapRef | null>(null);
  const [, redraw] = useState(0);
  const [openPopup, setOpenPopup] = useState<OpenPopup | null>(null);
  const clusters = cluster(markers, map);
  const visiblePopup = openPopup?.source === markers ? openPopup : null;

  return (
    <div className="map-shell" style={{ '--map-bottom-inset': `${bottomInset}px` } as React.CSSProperties}>
    <Map
      ref={setMap}
      initialViewState={{ ...WATERLOO_CENTER, zoom: 15 }}
      mapStyle="https://tiles.openfreemap.org/styles/bright"
      workerUrl={maplibreWorkerUrl}
      attributionControl={{ compact: true }}
      onMove={() => redraw(value => value + 1)}
      onMoveStart={() => setOpenPopup(null)}
      onLoad={() => redraw(value => value + 1)}
      onResize={() => redraw(value => value + 1)}
      style={{ width: '100%', height: '100%' }}
    >
      {clusters.map((group, index) => {
        const single = group.markers.length === 1;
        const size = single ? 48 : group.markers.length === 2 ? 36 : group.markers.length <= 4 ? 42 : 48;
        return (
          <Marker
            key={`${group.lat}-${group.lng}-${index}`}
            latitude={group.lat}
            longitude={group.lng}
            anchor={single ? 'bottom' : 'center'}
            offset={single ? [0, 4] : undefined}
          >
            <button
              type="button"
              className="block border-0 bg-transparent p-0"
              aria-label={single ? `Show ${group.markers[0].label}'s class details` : `Show ${group.markers.length} classes`}
              onClick={() => setOpenPopup({ ...group, offset: size, source: markers })}
            >
              {single
                ? <Pin color={group.markers[0].color} label={group.markers[0].label} />
                : <ClusterIcon markers={group.markers} />}
            </button>
          </Marker>
        );
      })}

      {map && clusters.map((group, index) => {
        const edge = edgePosition(map, group.lat, group.lng, bottomInset);
        if (edge.visible) return null;
        return (
          <Marker
            key={`edge-${group.lat}-${group.lng}-${index}`}
            latitude={edge.lat}
            longitude={edge.lng}
            anchor="center"
            style={{ zIndex: 1000 }}
          >
            <button
              type="button"
              className="edge-marker block border-0 bg-transparent p-0"
              title={`${group.markers.map(marker => marker.label).join(', ')} outside the visible map`}
              aria-label={`${group.markers.map(marker => marker.label).join(', ')} outside the visible map. Show class details`}
              onClick={() => setOpenPopup({ lat: edge.lat, lng: edge.lng, markers: group.markers, offset: 22, source: markers })}
            >
              <EdgeIcon markers={group.markers} angle={edge.angle} />
            </button>
          </Marker>
        );
      })}

      {visiblePopup && (
        <Popup
          latitude={visiblePopup.lat}
          longitude={visiblePopup.lng}
          offset={visiblePopup.offset}
          closeOnClick={false}
          onClose={() => setOpenPopup(null)}
        >
          <PopupContent markers={visiblePopup.markers} />
        </Popup>
      )}
    </Map>
    </div>
  );
}
