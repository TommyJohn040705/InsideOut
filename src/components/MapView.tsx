import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FloorPlanData, NavigationRoute, Point, RoomPOI } from '../types/navigation';

/**
 * Pan / zoom / pinch floor map.
 * - Map image and route are drawn in the plan's native pixel space (no stretching).
 * - Pins and labels are drawn in screen space so they stay crisp and constant size at any zoom.
 * - Room numbers appear only when the room is big enough on screen to fit its label.
 */

export interface MapViewHandle {
  fit: () => void;
  zoomBy: (f: number) => void;
  focusPoint: (p: Point, minScreenFrac?: number) => void;
  fitPoints: (pts: Point[], maxZoomOverFit?: number) => void;
}

interface MapViewProps {
  plan: FloorPlanData;
  route: NavigationRoute | null;
  walkedMeters: number;
  showWalker: boolean;
  followWalker: boolean;
  onUserMoved?: () => void;
  startRoom: RoomPOI | null;
  endRoom: RoomPOI | null;
  selectedRoom: RoomPOI | null;
  showOriginal: boolean;
  showGraph: boolean;
  editing: boolean;
  onTapRoom: (room: RoomPOI) => void;
  onTapEmpty?: (p: Point) => void;
  onMoveRoom?: (roomId: string, p: Point) => void;
  padding?: { top: number; right: number; bottom: number; left: number };
}

const CAT_DOT: Record<string, string> = {
  classroom: '#d97706', conference: '#d97706', lab: '#059669', workshop: '#059669', office: '#6366f1',
  restroom: '#0284c7', elevator: '#9333ea', stairs: '#9333ea', entrance: '#0891b2', exit: '#0891b2', bridge: '#0891b2',
  study: '#ca8a04', dining: '#ca8a04',
};

function legPointAt(pts: { x: number; y: number }[], frac: number) {
  if (pts.length === 0) return null;
  if (pts.length === 1) return { p: pts[0], ang: 0, i: 0 };
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lens.push(l); total += l;
  }
  let d = Math.max(0, Math.min(1, frac)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const t = lens[i] > 0 ? Math.min(1, d / lens[i]) : 0;
      const a = pts[i], b = pts[i + 1];
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ang: Math.atan2(b.y - a.y, b.x - a.x), i };
    }
    d -= lens[i];
  }
  return { p: pts[pts.length - 1], ang: 0, i: pts.length - 2 };
}

export const MapView = React.forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const {
    plan, route, walkedMeters, showWalker, followWalker, onUserMoved, startRoom, endRoom, selectedRoom,
    showOriginal, showGraph, editing, onTapRoom, onTapEmpty, onMoveRoom,
  } = props;
  const pad = props.padding || { top: 16, right: 16, bottom: 16, left: 16 };
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [nat, setNat] = useState({ w: 3067, h: 992 });
  const [view, setView] = useState({ s: 0.3, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const animRef = useRef<number | null>(null);

  const imgSrc = showOriginal && plan.originalImageUrl ? plan.originalImageUrl : plan.imageUrl;

  // container size
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    if (!box.w || !box.h) return null;
    const aw = Math.max(50, box.w - pad.left - pad.right), ah = Math.max(50, box.h - pad.top - pad.bottom);
    const s = Math.min(aw / nat.w, ah / nat.h);
    return { s, tx: pad.left + (aw - nat.w * s) / 2, ty: pad.top + (ah - nat.h * s) / 2 };
  }, [box.w, box.h, nat.w, nat.h, pad.top, pad.right, pad.bottom, pad.left]);

  const minScale = () => (fitView()?.s || 0.1) * 0.8;
  const maxScale = () => Math.max(1.6, (fitView()?.s || 0.1) * 14);

  const animateTo = useCallback((target: { s: number; tx: number; ty: number }, ms = 260) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const from = { ...viewRef.current };
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setView({ s: from.s + (target.s - from.s) * e, tx: from.tx + (target.tx - from.tx) * e, ty: from.ty + (target.ty - from.ty) * e });
      if (k < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  // fit when floor, image size or container changes
  const lastFitKey = useRef('');
  useEffect(() => {
    const key = `${plan.id}|${nat.w}x${nat.h}|${box.w}x${box.h}`;
    if (key === lastFitKey.current) return;
    const f = fitView();
    if (!f) return;
    const floorChanged = !lastFitKey.current.startsWith(plan.id + '|');
    lastFitKey.current = key;
    if (floorChanged || !followWalker) setView(f);
  }, [plan.id, nat, box, fitView, followWalker]);

  const zoomAround = useCallback((factor: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const s = Math.min(maxScale(), Math.max(minScale(), v.s * factor));
    const k = s / v.s;
    setView({ s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
  }, [fitView]);

  const toNat = (p: Point) => ({ x: (p.x / 100) * nat.w, y: (p.y / 100) * nat.h });

  const focusPoint = useCallback((p: Point, minScreenFrac = 0.35) => {
    const f = fitView();
    if (!f) return;
    const np = { x: (p.x / 100) * nat.w, y: (p.y / 100) * nat.h };
    const s = Math.max(viewRef.current.s, f.s * (minScreenFrac > 0 ? 2.6 : 1));
    const cx = pad.left + (box.w - pad.left - pad.right) / 2, cy = pad.top + (box.h - pad.top - pad.bottom) / 2;
    animateTo({ s, tx: cx - np.x * s, ty: cy - np.y * s });
  }, [fitView, nat, box, pad.left, pad.right, pad.top, pad.bottom, animateTo]);

  const fitPoints = useCallback((pts: Point[], maxZoomOverFit = 6) => {
    const f = fitView();
    if (!f || !pts.length) return;
    const xs = pts.map((p) => (p.x / 100) * nat.w), ys = pts.map((p) => (p.y / 100) * nat.h);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const aw = Math.max(50, box.w - pad.left - pad.right), ah = Math.max(50, box.h - pad.top - pad.bottom);
    const bw = Math.max(maxX - minX, 160), bh = Math.max(maxY - minY, 120);
    const s = Math.min(f.s * maxZoomOverFit, Math.max(f.s, Math.min(aw / (bw * 1.25), ah / (bh * 1.25))));
    const cxm = (minX + maxX) / 2, cym = (minY + maxY) / 2;
    animateTo({ s, tx: pad.left + aw / 2 - cxm * s, ty: pad.top + ah / 2 - cym * s });
  }, [fitView, nat, box, pad.left, pad.right, pad.top, pad.bottom, animateTo]);

  useImperativeHandle(ref, () => ({
    fitPoints,
    fit: () => { const f = fitView(); if (f) animateTo(f); },
    zoomBy: (f: number) => zoomAround(f, box.w / 2, box.h / 2),
    focusPoint,
  }), [fitView, animateTo, zoomAround, box, focusPoint, fitPoints]);

  // ---------------- gestures ----------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; t: number; moved: boolean; pinchD?: number; dragRoom?: string } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const screenToPct = (sx: number, sy: number): Point => {
    const v = viewRef.current;
    return { x: (((sx - v.tx) / v.s) / nat.w) * 100, y: (((sy - v.ty) / v.s) / nat.h) * 100 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (pointers.current.size === 1) {
      const roomEl = (e.target as HTMLElement).closest('[data-room-id]') as HTMLElement | null;
      gesture.current = { startX: p.x, startY: p.y, t: performance.now(), moved: false, dragRoom: editing && roomEl ? roomEl.dataset.roomId : undefined };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { ...(gesture.current || { startX: 0, startY: 0, t: 0 }), moved: true, pinchD: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size >= 2 && g.pinchD) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAround(d / g.pinchD, mid.x, mid.y);
      // pan with the midpoint of the moving finger
      const dx = (p.x - prev.x) / 2, dy = (p.y - prev.y) / 2;
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      g.pinchD = d;
      onUserMoved?.();
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > 6) g.moved = true;
    if (!g.moved) return;
    if (g.dragRoom && onMoveRoom) {
      onMoveRoom(g.dragRoom, screenToPct(p.x, p.y));
      return;
    }
    setView((v) => ({ ...v, tx: v.tx + (p.x - prev.x), ty: v.ty + (p.y - prev.y) }));
    onUserMoved?.();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved) return;
    // tap
    const p = local(e);
    const pt = screenToPct(p.x, p.y);
    const room = hitRoom(pt);
    if (room) onTapRoom(room);
    else onTapEmpty?.(pt);
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = local(e);
    zoomAround(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    onUserMoved?.();
  };
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const stop = (ev: WheelEvent) => ev.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  // ---------------- hit testing ----------------
  const hitRoom = (pt: Point): RoomPOI | null => {
    let best: RoomPOI | null = null;
    let bestArea = Infinity;
    for (const r of plan.rooms) {
      const b = r.bounds;
      if (b && pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height) {
        const a = b.width * b.height;
        if (a < bestArea) { bestArea = a; best = r; }
      }
    }
    if (best) return best;
    let bd = Infinity;
    for (const r of plan.rooms) {
      const d = Math.hypot((r.coords.x - pt.x) * (nat.w / nat.h), r.coords.y - pt.y);
      if (d < bd) { bd = d; best = r; }
    }
    return bd < 4 ? best : null;
  };

  // ---------------- route geometry ----------------
  const legs = useMemo(() => {
    if (!route) return [];
    if (route.legs && route.legs.length) return route.legs;
    return route.floorSegments.map((s, i) => ({
      id: `seg${i}`, type: 'floor' as const, floor: s.floor, waypoints: s.waypoints,
      startDistanceMeters: 0, distanceMeters: route.totalDistanceMeters,
    }));
  }, [route]);

  const floorLeg = legs.find((l) => l.type === 'floor' && l.floor === plan.floorNumber && l.waypoints.length > 1);
  const legPts = floorLeg ? floorLeg.waypoints.map(toNat) : [];

  let walker: { p: { x: number; y: number }; ang: number; i: number } | null = null;
  let walkerHere = false;
  if (floorLeg && route) {
    const local = walkedMeters - floorLeg.startDistanceMeters;
    const frac = floorLeg.distanceMeters > 0 ? local / floorLeg.distanceMeters : 0;
    walker = legPointAt(legPts, frac);
    const activeLeg = legs.find((l) => walkedMeters >= l.startDistanceMeters && walkedMeters <= l.startDistanceMeters + l.distanceMeters + 0.01);
    walkerHere = !!activeLeg && activeLeg === floorLeg;
    if (frac <= 0) walker = legPointAt(legPts, 0);
  }

  const donePts = walker && showWalker && walkerHere ? [...legPts.slice(0, walker.i + 1), walker.p] : [];
  const restPts = walker && showWalker && walkerHere ? [walker.p, ...legPts.slice(walker.i + 1)] : legPts;
  const poly = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

  // follow walker
  useEffect(() => {
    if (!followWalker || !showWalker || !walker || !walkerHere) return;
    const v = viewRef.current;
    const f = fitView();
    if (!f) return;
    const s = Math.max(v.s, f.s * 2.2);
    const cx = pad.left + (box.w - pad.left - pad.right) / 2, cy = pad.top + (box.h - pad.top - pad.bottom) / 2;
    const target = { s, tx: cx - walker.p.x * s, ty: cy - walker.p.y * s };
    // gentle easing toward target every frame
    setView((cur) => ({ s: cur.s + (target.s - cur.s) * 0.15, tx: cur.tx + (target.tx - cur.tx) * 0.15, ty: cur.ty + (target.ty - cur.ty) * 0.15 }));
  }, [walkedMeters, followWalker, showWalker, walkerHere, plan.id]);

  // smoothed heading
  const [heading, setHeading] = useState(0);
  const targetAng = walker ? (walker.ang * 180) / Math.PI : 0;
  useEffect(() => {
    setHeading((h) => {
      let d = targetAng - h;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return h + d * 0.35;
    });
  }, [targetAng, walkedMeters]);

  // ---------------- labels ----------------
  const S = (q: { x: number; y: number }) => ({ x: view.tx + q.x * view.s, y: view.ty + q.y * view.s });
  const labels = plan.rooms.filter((r) => {
    if (r.id === startRoom?.id || r.id === endRoom?.id || r.id === selectedRoom?.id) return false;
    const b = r.bounds;
    const wpx = b ? (b.width / 100) * nat.w * view.s : 0;
    const hpx = b ? (b.height / 100) * nat.h * view.s : 0;
    const label = r.roomNumber || r.name;
    return wpx > label.length * 7.5 + 6 && hpx > 16;
  });

  const marker = (r: RoomPOI | null, kind: 'start' | 'end' | 'sel') => {
    if (!r || (r.floor && r.floor !== plan.floorNumber)) return null;
    const q = S(toNat(r.coords));
    const col = kind === 'start' ? '#16a34a' : kind === 'end' ? '#dc2626' : '#2563eb';
    return (
      <div key={kind + r.id} className="absolute pointer-events-none" style={{ left: q.x, top: q.y, transform: 'translate(-50%, -100%)' }}>
        <div className="flex flex-col items-center">
          <div className="px-2 py-0.5 mb-1 rounded-md text-[11px] font-bold text-white shadow-md whitespace-nowrap" style={{ background: col }}>
            {r.roomNumber || r.name}
          </div>
          <svg width="22" height="28" viewBox="0 0 22 28">
            <path d="M11 27C11 27 2 16.5 2 10.5a9 9 0 0118 0C20 16.5 11 27 11 27z" fill={col} stroke="#fff" strokeWidth="2" />
            <circle cx="11" cy="10.5" r="3.4" fill="#fff" />
          </svg>
        </div>
      </div>
    );
  };

  const graphLines = useMemo(() => {
    if (!showGraph) return null;
    const ids = new Map(plan.hallways.map((h) => [h.id, h]));
    const out: React.ReactNode[] = [];
    for (const h of plan.hallways) {
      const a = toNat(h.coords);
      for (const t of h.connectedTo) {
        const o = ids.get(t);
        if (!o || o.id < h.id) continue;
        const b = toNat(o.coords);
        out.push(<line key={h.id + t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0ea5e9" strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={0.7} />);
      }
    }
    return out;
  }, [showGraph, plan.id, plan.hallways, nat]);

  const vertical = route?.steps.find((s) => s.isVerticalTransition && s.floor === plan.floorNumber);
  const arriving = route && route.floorSegments.length > 1 && route.floorSegments[route.floorSegments.length - 1].floor === plan.floorNumber
    ? route.floorSegments[route.floorSegments.length - 1].waypoints[0] : null;

  return (
    <div
      ref={boxRef}
      className={`relative w-full h-full overflow-hidden select-none touch-none ${editing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      style={{ background: '#eef1f5' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* map in native pixel space */}
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: nat.w, height: nat.h, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}>
        <img
          src={imgSrc}
          alt={plan.title}
          draggable={false}
          onLoad={(e) => {
            const im = e.currentTarget;
            if (im.naturalWidth && im.naturalHeight && !plan.imageUrl.endsWith('.svg')) setNat({ w: im.naturalWidth, h: im.naturalHeight });
            else if (plan.imageUrl.endsWith('.svg')) setNat({ w: 3067, h: 992 });
          }}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ background: showOriginal ? '#fff' : 'transparent' }}
        />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${nat.w} ${nat.h}`}>
          {graphLines}
          {legPts.length > 1 && (
            <g strokeLinecap="round" strokeLinejoin="round" fill="none">
              <polyline points={poly(legPts)} stroke="#1e3a8a" strokeWidth={10} vectorEffect="non-scaling-stroke" opacity={0.25} />
              {donePts.length > 1 && <polyline points={poly(donePts)} stroke="#94a3b8" strokeWidth={6} vectorEffect="non-scaling-stroke" />}
              {restPts.length > 1 && <polyline points={poly(restPts)} stroke="#2563eb" strokeWidth={6} vectorEffect="non-scaling-stroke" />}
            </g>
          )}
        </svg>
      </div>

      {/* screen-space labels */}
      <div className="absolute inset-0 pointer-events-none">
        {labels.map((r) => {
          const q = S(toNat(r.coords));
          if (q.x < -40 || q.y < -20 || q.x > box.w + 40 || q.y > box.h + 20) return null;
          return (
            <div
              key={r.id}
              data-room-id={r.id}
              className={`absolute text-[11px] font-semibold text-slate-700 whitespace-nowrap leading-none ${editing ? 'pointer-events-auto px-1 py-0.5 rounded bg-amber-100 ring-1 ring-amber-400' : ''}`}
              style={{ left: q.x, top: q.y, transform: 'translate(-50%, -50%)', textShadow: '0 0 3px #fff, 0 0 3px #fff' }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: CAT_DOT[r.category] || '#94a3b8' }} />
              {r.roomNumber || r.name}
            </div>
          );
        })}

        {/* floor change marker */}
        {vertical && (() => {
          const q = S(toNat(vertical.coords));
          return (
            <div className="absolute" style={{ left: q.x, top: q.y, transform: 'translate(-50%, -50%)' }}>
              <div className="px-2 py-1 rounded-full bg-purple-600 text-white text-[11px] font-bold shadow-md whitespace-nowrap">
                {vertical.floorChange ? `${vertical.action === 'take-elevator' ? 'Elevator' : 'Stairs'} to L${vertical.floorChange.toFloor}` : 'Change floor'}
              </div>
            </div>
          );
        })()}
        {arriving && (() => {
          const q = S(toNat(arriving));
          return (
            <div className="absolute" style={{ left: q.x, top: q.y, transform: 'translate(-50%, -50%)' }}>
              <div className="px-2 py-1 rounded-full bg-purple-600 text-white text-[11px] font-bold shadow-md whitespace-nowrap">Arrive L{plan.floorNumber}</div>
            </div>
          );
        })()}

        {marker(startRoom, 'start')}
        {marker(endRoom, 'end')}
        {selectedRoom && selectedRoom.id !== startRoom?.id && selectedRoom.id !== endRoom?.id && marker(selectedRoom, 'sel')}

        {walker && showWalker && walkerHere && (() => {
          const q = S(walker!.p);
          return (
            <div className="absolute" style={{ left: q.x, top: q.y, transform: 'translate(-50%, -50%)' }}>
              <div className="absolute -inset-3 rounded-full bg-blue-500/25 animate-ping" />
              <div className="relative w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: `rotate(${heading + 90}deg)` }}>
                  <circle cx="12" cy="12" r="11" fill="#2563eb" />
                  <path d="M12 5 L17.5 17 L12 14.2 L6.5 17 Z" fill="#fff" />
                </svg>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
});
