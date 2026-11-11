/**
 * Development fallback map: MapLibre GL + OpenFreeMap tiles (OpenStreetMap data).
 * This is NOT Google Maps. It exists so the campus overlays can be built and tested
 * without a Google key. It has no outdoor walking directions.
 */
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Vite's dependency pre-bundling breaks MapLibre's own worker lookup, so hand it the URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { LngLat } from '../georef';
import { CAMPUS_BOUNDS, CampusMapAdapter, FloorOverlay, MapMarker } from './types';

const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const KIND_COLOR: Record<MapMarker['kind'], string> = { entrance: '#475569', entrance_accessible: '#059669', destination: '#dc2626', user: '#2563eb' };

export function createMapLibreAdapter(el: HTMLElement, center: LngLat, zoom: number): Promise<CampusMapAdapter> {
  maplibregl.setWorkerUrl(workerUrl);
  const map = new maplibregl.Map({
    container: el,
    style: 'https://tiles.openfreemap.org/styles/positron',
    center, zoom,
    maxBounds: [[CAMPUS_BOUNDS.west, CAMPUS_BOUNDS.south], [CAMPUS_BOUNDS.east, CAMPUS_BOUNDS.north]],
    attributionControl: { compact: true },
  });
  let onClick: (id: string) => void = () => {};

  return new Promise((resolve, reject) => {
    map.on('error', (e) => { if (!map.isStyleLoaded()) reject(e.error); });
    map.on('load', () => {
      map.addSource('footprints', { type: 'geojson', data: empty, promoteId: 'id' });
      map.addSource('route', { type: 'geojson', data: empty });
      map.addSource('markers', { type: 'geojson', data: empty });
      map.addLayer({ id: 'fp-fill', type: 'fill', source: 'footprints', paint: {
        'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#fbbf24', '#c7d2fe'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.35, 0.55],
      } });
      map.addLayer({ id: 'fp-line', type: 'line', source: 'footprints', paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#b45309', '#6366f1'],
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1],
      } });
      map.addLayer({ id: 'fp-label', type: 'symbol', source: 'footprints', minzoom: 14.5, layout: {
        'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': false,
      }, paint: { 'text-color': '#1e293b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 5 } });
      map.addLayer({ id: 'markers', type: 'circle', source: 'markers', paint: {
        'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
      } });
      map.addLayer({ id: 'marker-label', type: 'symbol', source: 'markers', minzoom: 17, layout: {
        'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 1.2], 'text-anchor': 'top',
      }, paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } });
      map.on('click', 'fp-fill', (e) => { const id = e.features?.[0]?.properties?.id; if (id) onClick(id); });
      map.on('mouseenter', 'fp-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'fp-fill', () => { map.getCanvas().style.cursor = ''; });

      let selected: string | null = null, floorToken = 0;
      // Optional chaining: effects can fire once more after the map is torn down (hot reload).
      const src = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      resolve({
        provider: 'maplibre',
        setFootprints(fc, cb) { onClick = cb; src('footprints')?.setData(fc); },
        setSelected(id) {
          if (selected) map.setFeatureState({ source: 'footprints', id: selected }, { selected: false });
          selected = id;
          if (id) map.setFeatureState({ source: 'footprints', id }, { selected: true });
        },
        flyTo(c, z, padBottom = 0) { map.flyTo({ center: c, zoom: z, duration: 800, padding: { top: 0, left: 0, right: 0, bottom: padBottom } }); },
        setFloorOverlay(o: FloorOverlay | null) {
          if (map.getLayer('floor')) map.removeLayer('floor');
          if (map.getSource('floor')) map.removeSource('floor');
          floorToken++;
          if (!o) return;
          // MapLibre's image source cannot decode SVG, so rasterise the traced floor first.
          const token = floorToken, img = new Image();
          img.onload = () => {
            if (token !== floorToken) return; // a newer floor was requested meanwhile
            const c = document.createElement('canvas');
            [c.width, c.height] = o.imageSize;
            c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
            map.addSource('floor', { type: 'image', url: c.toDataURL('image/png'), coordinates: o.corners });
            map.addLayer({ id: 'floor', type: 'raster', source: 'floor', paint: { 'raster-opacity': 0.95, 'raster-fade-duration': 0 } }, 'fp-line');
          };
          img.src = o.url;
        },
        setRoute(line) {
          src('route')?.setData(line && line.length > 1 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } } : empty);
        },
        setMarkers(markers) {
          src('markers')?.setData({ type: 'FeatureCollection', features: markers.map((m) => ({
            type: 'Feature', properties: { label: m.label || '', color: KIND_COLOR[m.kind] }, geometry: { type: 'Point', coordinates: m.lngLat },
          })) });
        },
        async walkingRoute() { return null; },
        clearWalkingRoute() {},
        destroy() { map.remove(); },
      });
    });
  });
}
