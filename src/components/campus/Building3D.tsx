import React, { useMemo, useState } from 'react';
import { Box, X } from 'lucide-react';
import type { IndoorSite } from '../../campus/tripPlanner';
import type { LngLat } from '../../campus/georef';
import { FOOTPRINTS } from '../../campus/campusData';

const M_PER_DEG_LAT = 111_320;
/** Local metres east/north of an origin (flat-earth, fine across one building). */
const toM = (o: LngLat) => (p: LngLat): [number, number] => [(p[0] - o[0]) * M_PER_DEG_LAT * Math.cos((o[1] * Math.PI) / 180), (p[1] - o[1]) * M_PER_DEG_LAT];

/**
 * Exploded 3D view of a building: every aligned floor drawn at its own map placement, stacked, so
 * floors line up exactly as they do on the campus map. CSS 3D only (no WebGL). Tap a floor to open it.
 */
export function Building3D({ site, name, highlightFloor, onOpenFloor, onClose }: { site: IndoorSite; name: string; highlightFloor?: number | null; onOpenFloor: (floor: number) => void; onClose: () => void }) {
  const [turn, setTurn] = useState(-30);
  const [gap, setGap] = useState(60);
  const floors = useMemo(() => {
    const seen = new Set<number>();
    return site.plans
      .filter((p) => { if (seen.has(p.floorNumber) || !site.georef(p.floorNumber)) return false; seen.add(p.floorNumber); return true; })
      .sort((a, b) => a.floorNumber - b.floorNumber)
      .map((p) => ({ p, g: site.georef(p.floorNumber)! }));
  }, [site]);

  const layout = useMemo(() => {
    if (!floors.length) return null;
    const all = floors.flatMap(({ g }) => g.corners);
    const o: LngLat = [all.reduce((s, c) => s + c[0], 0) / all.length, all.reduce((s, c) => s + c[1], 0) / all.length];
    const m = toM(o);
    const span = Math.max(...all.map((c) => Math.hypot(...m(c)))) || 50;
    const s = 190 / span; // px per metre: the building fits a ~380 px circle
    const fp = FOOTPRINTS.features.find((f) => (f.properties as { id?: string } | null)?.id === site.buildingId);
    const ring = fp && (fp.geometry.type === 'Polygon' ? fp.geometry.coordinates[0] : fp.geometry.type === 'MultiPolygon' ? fp.geometry.coordinates[0][0] : null);
    const outline = ring ? (ring as LngLat[]).map((c) => m(c)).map(([x, y]) => `${x * s},${-y * s}`).join(' ') : null;
    const placed = floors.map(({ p, g }) => {
      const [W, H] = g.source.imageSize;
      const [tl, tr, , bl] = g.corners.map(m);
      // Image pixel (x, y) -> screen px: TL + x*(TR-TL)/W + y*(BL-TL)/H, with north up (screen y = -north).
      const t = `matrix(${((tr[0] - tl[0]) / W) * s}, ${(-(tr[1] - tl[1]) / W) * s}, ${((bl[0] - tl[0]) / H) * s}, ${(-(bl[1] - tl[1]) / H) * s}, ${tl[0] * s}, ${-tl[1] * s})`;
      return { p, W, H, t };
    });
    return { placed, outline };
  }, [floors, site.buildingId]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-label={`${name} in 3D`} className="bg-white w-full md:w-[720px] h-[85dvh] md:h-[640px] rounded-t-2xl md:rounded-2xl p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <Box className="w-5 h-5 text-indigo-600" /><h2 className="font-extrabold flex-1 truncate">{name}: floors in 3D</h2>
          <button aria-label="Close 3D view" onClick={onClose} className="p-1 text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        {!layout ? <p className="text-sm text-slate-600">No floor of this building is placed on the map yet.</p> : (
          <>
            <div className="flex-1 min-h-0 overflow-hidden relative bg-gradient-to-b from-slate-50 to-slate-200 rounded-xl" style={{ perspective: 1200 }}>
              <div className="absolute left-1/2 top-[72%]" style={{ transformStyle: 'preserve-3d', transform: `rotateX(58deg) rotateZ(${turn}deg)` }}>
                {layout.outline && (
                  <svg className="absolute overflow-visible" style={{ left: 0, top: 0 }} width="1" height="1"><polygon points={layout.outline} fill="rgba(251,191,36,0.25)" stroke="#b45309" strokeWidth="1.5" /></svg>
                )}
                {layout.placed.map(({ p, W, H, t }, i) => (
                  <div key={p.floorNumber} style={{ position: 'absolute', left: 0, top: 0, transformStyle: 'preserve-3d', transform: `translateZ(${(i + 0.3) * gap}px)` }}>
                    <img src={p.imageUrl} alt={`Floor ${p.floorNumber}`} draggable={false} onClick={() => onOpenFloor(p.floorNumber)}
                      style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, maxWidth: 'none', transformOrigin: '0 0', transform: t, cursor: 'pointer',
                        opacity: highlightFloor == null || highlightFloor === p.floorNumber ? 0.92 : 0.35,
                        filter: highlightFloor === p.floorNumber ? 'drop-shadow(0 0 6px #2563eb)' : 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Open a floor">
              {layout.placed.map(({ p }) => (
                <button key={p.floorNumber} onClick={() => onOpenFloor(p.floorNumber)} className={`h-9 min-w-9 px-2.5 rounded-lg text-xs font-bold ${highlightFloor === p.floorNumber ? 'bg-blue-600 text-white' : 'bg-indigo-50 text-indigo-800'}`}>{p.floorNumber}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 text-[11px] font-semibold text-slate-600">
              <label className="flex items-center gap-2">Turn<input type="range" min={-180} max={180} value={turn} onChange={(e) => setTurn(+e.target.value)} className="flex-1" aria-label="Turn the building" /></label>
              <label className="flex items-center gap-2">Spread<input type="range" min={10} max={140} value={gap} onChange={(e) => setGap(+e.target.value)} className="flex-1" aria-label="Space between floors" /></label>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Each floor is drawn where it is placed on the campus map (draft alignment, not surveyed). The orange outline is the OpenStreetMap footprint. Tap a floor to open it.</p>
          </>
        )}
      </div>
    </div>
  );
}
