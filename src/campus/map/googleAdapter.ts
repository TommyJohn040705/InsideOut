/**
 * Google Maps adapter: official Maps JavaScript API, loaded with the browser key in
 * VITE_GOOGLE_MAPS_API_KEY. Campus footprints are drawn with the Data layer, the indoor
 * floor with a custom OverlayView (rotated, so GroundOverlay cannot be used), and outdoor
 * walking routes come from the Directions service.
 */
import type { LngLat } from '../georef';
import { CAMPUS_BOUNDS, CampusMapAdapter, FloorOverlay, MapMarker } from './types';

let loading: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    (window as any).__insideOutGmapsReady = () => resolve();
    // Google reports a rejected key through this global hook rather than a script error.
    (window as any).gm_authFailure = () => reject(new Error('Google Maps rejected the API key (check key restrictions and enabled APIs).'));
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__insideOutGmapsReady`;
    s.async = true;
    s.onerror = () => reject(new Error('Could not load the Google Maps JavaScript API.'));
    document.head.appendChild(s);
  });
  return loading;
}

const ll = (p: LngLat) => ({ lat: p[1], lng: p[0] });
const KIND_COLOR: Record<MapMarker['kind'], string> = { entrance: '#475569', entrance_accessible: '#059669', destination: '#dc2626', user: '#2563eb' };

export async function createGoogleAdapter(el: HTMLElement, center: LngLat, zoom: number, key: string, mapId?: string): Promise<CampusMapAdapter> {
  await loadGoogleMaps(key);
  const g = google.maps;
  const map = new g.Map(el, {
    center: ll(center), zoom, mapId: mapId || undefined,
    restriction: { latLngBounds: CAMPUS_BOUNDS, strictBounds: false },
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    clickableIcons: false, gestureHandling: 'greedy',
  });

  let selected: string | null = null;
  let labels: google.maps.Marker[] = [];
  let markers: google.maps.Marker[] = [];
  let floor: FloorImage | null = null;
  let floorOpacity = 0.95;
  let clickCb: ((at: LngLat) => void) | null = null;
  map.addListener('click', (e: google.maps.MapMouseEvent) => { if (clickCb && e.latLng) { const cb = clickCb; clickCb = null; map.setOptions({ draggableCursor: null }); cb([e.latLng.lng(), e.latLng.lat()]); } });
  const route = new g.Polyline({ map, strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.95, zIndex: 5 });
  const directions = new g.DirectionsRenderer({ map, suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: '#0ea5e9', strokeWeight: 5 } });

  // Indoor rooms and corridors get their own Data layer so they style and clear independently.
  // shortcut: no room labels on Google yet (the fallback map has them); add markers if needed.
  const indoorLayer = new g.Data({ map });
  indoorLayer.setStyle((f) => {
    const kind = f.getProperty('kind'), layer = f.getProperty('layer');
    if (layer === 'path') return { strokeColor: kind === 'steps' ? '#b45309' : kind === 'bridge' || kind === 'tunnel' ? '#7c3aed' : '#0f766e', strokeWeight: 2.5, zIndex: 3, clickable: false };
    if (layer === 'elevator') return { icon: { path: g.SymbolPath.CIRCLE, scale: 5, fillColor: '#7c3aed', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 }, zIndex: 4, clickable: false };
    return { fillColor: kind === 'toilets' ? '#bae6fd' : kind === 'corridor' || kind === 'area' ? '#f1f5f9' : '#fef3c7', fillOpacity: 0.95, strokeColor: '#78716c', strokeWeight: 1, zIndex: 2, clickable: false };
  });

  const restyle = () => map.data.setStyle((f) => {
    const on = f.getProperty('id') === selected;
    return { fillColor: on ? '#fbbf24' : '#c7d2fe', fillOpacity: on ? 0.3 : 0.5, strokeColor: on ? '#b45309' : '#6366f1', strokeWeight: on ? 2.5 : 1, zIndex: 1 };
  });
  const showLabels = () => { const on = (map.getZoom() || 0) >= 16; labels.forEach((m) => m.setVisible(on)); };
  map.addListener('zoom_changed', showLabels);

  /** Image positioned by three corners, so it rotates and scales with the map. */
  class FloorImage extends g.OverlayView {
    img = document.createElement('img');
    constructor(private o: FloorOverlay) {
      super();
      this.img.src = o.url;
      Object.assign(this.img.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', width: `${o.imageSize[0]}px`, height: `${o.imageSize[1]}px`, maxWidth: 'none', pointerEvents: 'none', opacity: String(floorOpacity) });
    }
    onAdd() { this.getPanes()!.overlayLayer.appendChild(this.img); }
    onRemove() { this.img.remove(); }
    draw() {
      const p = this.getProjection();
      if (!p) return;
      const [w, h] = this.o.imageSize;
      const tl = p.fromLatLngToDivPixel(ll(this.o.corners[0]))!, tr = p.fromLatLngToDivPixel(ll(this.o.corners[1]))!, bl = p.fromLatLngToDivPixel(ll(this.o.corners[3]))!;
      this.img.style.transform = `matrix(${(tr.x - tl.x) / w},${(tr.y - tl.y) / w},${(bl.x - tl.x) / h},${(bl.y - tl.y) / h},${tl.x},${tl.y})`;
    }
  }

  return {
    provider: 'google',
    setFootprints(fc, onClick) {
      map.data.forEach((f) => map.data.remove(f));
      map.data.addGeoJson(fc, { idPropertyName: 'id' });
      restyle();
      // While placing a control point, a click on a footprint is a point, not a selection.
      map.data.addListener('click', (e: google.maps.Data.MouseEvent) => { if (clickCb && e.latLng) { const cb = clickCb; clickCb = null; map.setOptions({ draggableCursor: null }); cb([e.latLng.lng(), e.latLng.lat()]); return; } onClick(String(e.feature.getProperty('id'))); });
      labels.forEach((m) => m.setMap(null));
      labels = [];
      map.data.forEach((f) => {
        const text = f.getProperty('code') as string | null;
        if (!text) return;
        const b = new g.LatLngBounds();
        f.getGeometry()!.forEachLatLng((p) => b.extend(p));
        labels.push(new g.Marker({
          map, position: b.getCenter(), clickable: false,
          icon: { path: g.SymbolPath.CIRCLE, scale: 0 },
          label: { text, color: '#1e293b', fontSize: '12px', fontWeight: '700' },
        }));
      });
      showLabels();
    },
    setSelected(id) { selected = id; restyle(); },
    flyTo(c, z, padBottom = 0) { map.setZoom(z); map.panTo(ll(c)); if (padBottom) map.panBy(0, padBottom / 2); },
    setFloorOpacity(n) { floorOpacity = n; if (floor) floor.img.style.opacity = String(n); },
    onMapClick(cb) { clickCb = cb; map.setOptions({ draggableCursor: cb ? 'crosshair' : null }); },
    setFloorOverlay(o) {
      floor?.setMap(null);
      floor = o ? new FloorImage(o) : null;
      floor?.setMap(map);
    },
    setIndoorVector(fc) {
      indoorLayer.forEach((f) => indoorLayer.remove(f));
      if (fc) indoorLayer.addGeoJson(fc);
    },
    setRoute(line) { route.setPath((line || []).map(ll)); },
    setMarkers(list) {
      markers.forEach((m) => m.setMap(null));
      markers = list.map((m) => new g.Marker({
        map, position: ll(m.lngLat), title: m.label, zIndex: 10,
        icon: { path: g.SymbolPath.CIRCLE, scale: 6, fillColor: KIND_COLOR[m.kind], fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
      }));
    },
    async walkingRoute(from, to) {
      const res = await new g.DirectionsService().route({ origin: ll(from), destination: ll(to), travelMode: g.TravelMode.WALKING });
      directions.setDirections(res);
      const leg = res.routes[0]?.legs[0];
      return leg ? { distanceM: leg.distance?.value || 0, durationS: leg.duration?.value || 0 } : null;
    },
    clearWalkingRoute() { directions.set('directions', null); },
    destroy() {
      floor?.setMap(null); indoorLayer.setMap(null); route.setMap(null); directions.setMap(null);
      [...labels, ...markers].forEach((m) => m.setMap(null));
      g.event.clearInstanceListeners(map);
    },
  };
}
