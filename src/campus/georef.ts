/**
 * Floor-plan georeferencing: image pixels <-> local metres <-> longitude/latitude.
 *
 * One transform per drawing frame. It is a similarity (uniform scale + rotation +
 * translation), so a floor plan is never stretched to fit a footprint. The fit is
 * least squares over control points, and the residuals are kept so a reviewer can
 * see how good the alignment is.
 */
export type LngLat = [number, number];
export type Px = [number, number];

export interface ControlPoint {
  px: Px;
  lngLat: LngLat;
  note: string;
}

export type GeorefReview = 'draft_unreviewed' | 'human_reviewed' | 'surveyed';

export interface GeorefSource {
  buildingId: string;
  /** Floor numbers that share this drawing frame. */
  floors: number[];
  imageSize: [number, number];
  method: string;
  review: GeorefReview;
  controlPoints: ControlPoint[];
  notes?: string[];
}

export interface Georef {
  source: GeorefSource;
  metresPerPixel: number;
  /** Compass bearing of the image's +x axis, degrees clockwise from north. */
  xAxisBearingDeg: number;
  residualsM: number[];
  rmsM: number;
  pxToLngLat(px: Px): LngLat;
  lngLatToPx(ll: LngLat): Px;
  /** Room/corridor coordinates in the app are percentages of the image. */
  pctToLngLat(p: { x: number; y: number }): LngLat;
  lngLatToPct(ll: LngLat): { x: number; y: number };
  /** Image corners as [topLeft, topRight, bottomRight, bottomLeft]. */
  corners: [LngLat, LngLat, LngLat, LngLat];
}

const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function distanceM(a: LngLat, b: LngLat): number {
  return Math.hypot((a[0] - b[0]) * mPerDegLng((a[1] + b[1]) / 2), (a[1] - b[1]) * M_PER_DEG_LAT);
}

export function fitGeoref(source: GeorefSource): Georef {
  const cps = source.controlPoints;
  if (cps.length < 2) throw new Error(`${source.buildingId}: georeferencing needs at least 2 control points`);

  // Local east/north metres around the control points' mean position.
  const lng0 = cps.reduce((s, c) => s + c.lngLat[0], 0) / cps.length;
  const lat0 = cps.reduce((s, c) => s + c.lngLat[1], 0) / cps.length;
  const kx = mPerDegLng(lat0);
  const toLocal = (ll: LngLat): Px => [(ll[0] - lng0) * kx, (ll[1] - lat0) * M_PER_DEG_LAT];

  // Treat points as complex numbers. Image y runs down, so z = x - iy keeps the
  // fit a pure rotation (no mirror). Solve w = a*z + b by least squares.
  const z = cps.map((c) => [c.px[0], -c.px[1]] as Px);
  const w = cps.map((c) => toLocal(c.lngLat));
  const mean = (v: Px[]): Px => [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length];
  const zm = mean(z), wm = mean(w);
  let num: Px = [0, 0], den = 0;
  for (let i = 0; i < z.length; i++) {
    const zx = z[i][0] - zm[0], zy = z[i][1] - zm[1];
    const wx = w[i][0] - wm[0], wy = w[i][1] - wm[1];
    num = [num[0] + wx * zx + wy * zy, num[1] + wy * zx - wx * zy]; // w * conj(z)
    den += zx * zx + zy * zy;
  }
  if (den === 0) throw new Error(`${source.buildingId}: control points are all at the same pixel`);
  const a: Px = [num[0] / den, num[1] / den];
  const b: Px = [wm[0] - (a[0] * zm[0] - a[1] * zm[1]), wm[1] - (a[0] * zm[1] + a[1] * zm[0])];
  const scale = Math.hypot(a[0], a[1]);

  const pxToLngLat = (px: Px): LngLat => {
    const x = px[0], y = -px[1];
    const e = a[0] * x - a[1] * y + b[0], n = a[0] * y + a[1] * x + b[1];
    return [lng0 + e / kx, lat0 + n / M_PER_DEG_LAT];
  };
  const lngLatToPx = (ll: LngLat): Px => {
    const [e, n] = toLocal(ll);
    const dx = e - b[0], dy = n - b[1];
    // z = (w - b) / a
    const x = (dx * a[0] + dy * a[1]) / (scale * scale), y = (dy * a[0] - dx * a[1]) / (scale * scale);
    return [x, -y];
  };

  const [W, H] = source.imageSize;
  const residualsM = cps.map((c) => distanceM(pxToLngLat(c.px), c.lngLat));
  return {
    source,
    metresPerPixel: scale,
    xAxisBearingDeg: ((Math.atan2(a[0], a[1]) * 180) / Math.PI + 360) % 360,
    residualsM,
    rmsM: Math.sqrt(residualsM.reduce((s, r) => s + r * r, 0) / residualsM.length),
    pxToLngLat,
    lngLatToPx,
    pctToLngLat: (p) => pxToLngLat([(p.x / 100) * W, (p.y / 100) * H]),
    lngLatToPct: (ll) => { const [x, y] = lngLatToPx(ll); return { x: (x / W) * 100, y: (y / H) * 100 }; },
    corners: [pxToLngLat([0, 0]), pxToLngLat([W, 0]), pxToLngLat([W, H]), pxToLngLat([0, H])],
  };
}
