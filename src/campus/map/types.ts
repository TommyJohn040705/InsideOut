import type { LngLat } from '../georef';

export type MapProvider = 'google' | 'maplibre';

export interface FloorOverlay {
  url: string;
  imageSize: [number, number];
  /** [topLeft, topRight, bottomRight, bottomLeft] */
  corners: [LngLat, LngLat, LngLat, LngLat];
}

export interface MapMarker {
  id: string;
  lngLat: LngLat;
  label?: string;
  kind: 'entrance' | 'entrance_accessible' | 'destination' | 'user';
}

/** Everything the campus UI needs from a map engine. Google Maps and MapLibre both implement it. */
export interface CampusMapAdapter {
  readonly provider: MapProvider;
  setFootprints(fc: GeoJSON.FeatureCollection, onClick: (buildingId: string) => void): void;
  setSelected(buildingId: string | null): void;
  /** padBottom: pixels hidden by a bottom sheet, so the target stays in view. */
  flyTo(center: LngLat, zoom: number, padBottom?: number): void;
  setFloorOverlay(overlay: FloorOverlay | null): void;
  setRoute(line: LngLat[] | null): void;
  setMarkers(markers: MapMarker[]): void;
  /** Outdoor walking route. Only Google implements it; the fallback returns null. */
  walkingRoute(from: LngLat, to: LngLat): Promise<{ distanceM: number; durationS: number } | null>;
  clearWalkingRoute(): void;
  destroy(): void;
}

// Loose bounds around the main campus, used to keep browsing campus-focused.
export const CAMPUS_BOUNDS = { west: -80.575, south: 43.458, east: -80.525, north: 43.486 };
