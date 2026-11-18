/**
 * Minimal reader for the University of Waterloo campus GIS shapefiles (NAD83 / UTM zone 17N):
 * .shp geometry (points, lines, polygons), .dbf attributes, and UTM -> WGS84 lng/lat.
 * No dependency: the formats are simple and only these files are read.
 */
import { readFileSync, existsSync } from 'node:fs';

export type LngLat = [number, number];
export interface Shape { kind: 'point' | 'line' | 'polygon'; parts: LngLat[][]; attrs: Record<string, string | number> }

/** NAD83 / UTM zone 17N (central meridian -81) to lng/lat (GRS80; NAD83 ~ WGS84 within a metre here). */
export function utm17ToLngLat(E: number, N: number): LngLat {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = E - 500000, y = N;
  const M = y / k0, mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p) ** 2, T1 = Math.tan(p) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2), R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(p) ** 2) ** 1.5, D = x / (N1 * k0);
  const lat = p - ((N1 * Math.tan(p)) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(p);
  return [+(-81 + (lng * 180) / Math.PI).toFixed(7), +((lat * 180) / Math.PI).toFixed(7)];
}

function readDbf(path: string): Record<string, string | number>[] {
  if (!existsSync(path)) return [];
  const b = readFileSync(path), n = b.readUInt32LE(4), hlen = b.readUInt16LE(8), rlen = b.readUInt16LE(10);
  const fields: { name: string; type: string; len: number }[] = [];
  for (let o = 32; b[o] !== 0x0d && o < hlen; o += 32) fields.push({ name: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), type: String.fromCharCode(b[o + 11]), len: b[o + 16] });
  const rows: Record<string, string | number>[] = [];
  for (let i = 0; i < n; i++) {
    let o = hlen + i * rlen + 1; const r: Record<string, string | number> = {};
    for (const f of fields) { const v = b.toString('latin1', o, o + f.len).trim(); r[f.name] = f.type === 'N' || f.type === 'F' ? (v === '' ? '' : Number(v)) : v; o += f.len; }
    rows.push(r);
  }
  return rows;
}

/** Reads one shapefile (path without extension). */
export function readShapefile(base: string): Shape[] {
  const b = readFileSync(`${base}.shp`), attrs = readDbf(`${base}.dbf`), out: Shape[] = [];
  let o = 100, i = 0;
  while (o + 8 <= b.length) {
    const len = b.readInt32BE(o + 4) * 2, s = o + 8, type = b.readInt32LE(s);
    if (type === 1 || type === 11 || type === 21) out.push({ kind: 'point', parts: [[utm17ToLngLat(b.readDoubleLE(s + 4), b.readDoubleLE(s + 12))]], attrs: attrs[i] || {} });
    else if ([3, 5, 13, 15, 23, 25].includes(type)) {
      const np = b.readInt32LE(s + 36), nPts = b.readInt32LE(s + 40), starts = Array.from({ length: np }, (_, k) => b.readInt32LE(s + 44 + 4 * k));
      const p0 = s + 44 + 4 * np, parts: LngLat[][] = [];
      for (let k = 0; k < np; k++) { const end = k + 1 < np ? starts[k + 1] : nPts, part: LngLat[] = []; for (let q = starts[k]; q < end; q++) part.push(utm17ToLngLat(b.readDoubleLE(p0 + 16 * q), b.readDoubleLE(p0 + 16 * q + 8))); parts.push(part); }
      out.push({ kind: type % 10 === 5 ? 'polygon' : 'line', parts, attrs: attrs[i] || {} });
    }
    o = s + len; i++;
  }
  return out;
}
