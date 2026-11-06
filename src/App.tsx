/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass, Sparkles, Camera, Upload, Pencil, Flag, CircleHelp, Plus, Minus, Maximize, Layers, FileImage, Menu, X,
  LocateFixed, ChevronLeft, Accessibility, Bath, ArrowUpDown, GraduationCap, FlaskConical, DoorOpen, Globe,
} from 'lucide-react';
import { SAMPLE_FLOOR_PLANS } from './data/sampleFloorPlans';
import { FloorPlanData, RoomPOI, Point, NavigationRoute, POICategory } from './types/navigation';
import { calculateIndoorRoute } from './utils/pathfinding';
import { speakGuidance } from './utils/speech';
import { FloorPlanEditorModal } from './components/FloorPlanEditorModal';
import { ReportDiscrepancyModal } from './components/ReportDiscrepancyModal';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { UploadModal } from './components/UploadModal';
import { Assistant } from './components/Assistant';
import { RoomLookup, LookupResult } from './components/RoomLookup';
import { HelpModal } from './components/HelpModal';
import { MapView, MapViewHandle } from './components/MapView';
import {
  cx, FloorPicker, NavBanner, NavFooter, RoomCard, RoutePlanner, RouteSummary, SearchInput, SearchResults, StepsList, useRoomSearch, roomTitle,
} from './components/Panels';

// Walking simulation: ~1.3 m/s with 4x demo multiplier
const WALKING_SPEED_MPS = 1.3 * 4;

function useIsMobile() {
  const q = '(max-width: 1023px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}

const QUICK = [
  { label: 'Washrooms', q: 'washroom', icon: Bath },
  { label: 'Elevators', q: 'elevator', icon: ArrowUpDown },
  { label: 'Classrooms', q: 'classroom', icon: GraduationCap },
  { label: 'Labs', q: 'lab', icon: FlaskConical },
  { label: 'Entrances', q: 'entrance', icon: DoorOpen },
];

type SearchTarget = 'dest' | 'start';

const OVERRIDES_KEY = 'floornav.roomOverrides.v1';
type Overrides = Record<string, Partial<RoomPOI>>;
function loadOverrides(): Overrides {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}') || {}; } catch { return {}; }
}
function applyOverrides(plans: FloorPlanData[], o: Overrides): FloorPlanData[] {
  if (!Object.keys(o).length) return plans;
  return plans.map((p) => ({ ...p, rooms: p.rooms.map((r) => (o[r.id] ? { ...r, ...o[r.id] } : r)) }));
}
const INITIAL_PLANS = applyOverrides(SAMPLE_FLOOR_PLANS, loadOverrides());

export default function App() {
  const isMobile = useIsMobile();
  const [plans, setPlans] = useState<FloorPlanData[]>(INITIAL_PLANS);
  const [currentPlan, setCurrentPlan] = useState<FloorPlanData>(INITIAL_PLANS[0]);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupRoom, setLookupRoom] = useState<RoomPOI | null>(null);

  const [startRoom, setStartRoom] = useState<RoomPOI | null>(null);
  const [endRoom, setEndRoom] = useState<RoomPOI | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isAccessibleOnly, setIsAccessibleOnly] = useState(true);
  const [voice, setVoice] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [walked, setWalked] = useState(0);
  const [follow, setFollow] = useState(true);

  const [query, setQuery] = useState('');
  const [searchTarget, setSearchTarget] = useState<SearchTarget>('dest');
  const [searchOpen, setSearchOpen] = useState(false);
  const [inspected, setInspected] = useState<RoomPOI | null>(null);
  const [sheetFull, setSheetFull] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomPOI | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportingRoom, setReportingRoom] = useState<RoomPOI | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isWayfinderOpen, setIsWayfinderOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const mapRef = useRef<MapViewHandle>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetH, setSheetH] = useState(180);
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSheetH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const walkedRef = useRef(0);
  const stepRef = useRef(0);
  const spokenRef = useRef(-1);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const planRef = useRef(currentPlan);
  planRef.current = currentPlan;
  const plansRef = useRef(plans);
  plansRef.current = plans;

  const buildingId = currentPlan.buildingId || currentPlan.id;
  const buildingPlans = useMemo(
    () => plans.filter((p) => (p.buildingId || p.id) === buildingId).sort((a, b) => a.floorNumber - b.floorNumber),
    [plans, buildingId]
  );
  const buildings = useMemo(() => {
    const m = new Map<string, FloorPlanData>();
    for (const p of plans) { const k = p.buildingId || p.id; if (!m.has(k)) m.set(k, p); }
    return [...m.values()];
  }, [plans]);
  const allRooms = useMemo(() => buildingPlans.flatMap((p) => p.rooms.map((r) => ({ ...r, floor: r.floor ?? p.floorNumber }))), [buildingPlans]);
  const results = useRoomSearch(allRooms, query);

  // default start: building entrance
  useEffect(() => {
    if (startRoom && (startRoom.buildingId || '') === (currentPlan.buildingId || '')) return;
    const first = buildingPlans.find((p) => p.defaultStartId) || buildingPlans[0];
    const def = first?.rooms.find((r) => r.id === first.defaultStartId) || first?.rooms.find((r) => r.category === 'entrance') || first?.rooms[0] || null;
    setStartRoom(def ? { ...def, floor: def.floor ?? first.floorNumber } : null);
    setEndRoom(null);
  }, [buildingId]);

  const goFloor = (n: number) => {
    const p = plansRef.current.find((x) => (x.buildingId || x.id) === (planRef.current.buildingId || planRef.current.id) && x.floorNumber === n);
    if (p && p.id !== planRef.current.id) setCurrentPlan(p);
  };

  // route
  useEffect(() => {
    if (!startRoom || !endRoom || startRoom.id === endRoom.id) { setRoute(null); return; }
    const sFloor = startRoom.floor ?? currentPlan.floorNumber;
    const eFloor = endRoom.floor ?? currentPlan.floorNumber;
    const sPlan = buildingPlans.find((p) => p.floorNumber === sFloor) || currentPlan;
    const r = calculateIndoorRoute(sPlan, startRoom.coords, startRoom.name, endRoom.coords, endRoom.name, startRoom.id, endRoom.id, {
      isAccessibleOnly, allFloors: buildingPlans, startFloor: sFloor, endFloor: eFloor,
    });
    setRoute(r);
    setStepIndex(0); stepRef.current = 0; spokenRef.current = -1;
    setWalked(0); walkedRef.current = 0;
  }, [startRoom, endRoom, isAccessibleOnly, buildingPlans]);

  const stepForDistance = (r: NavigationRoute, d: number) => {
    let idx = 0;
    for (let i = 0; i < r.steps.length; i++) {
      if ((r.steps[i].cumulativeDistanceMeters ?? 0) <= d + 0.1) idx = i; else break;
    }
    return idx;
  };
  const floorForDistance = (r: NavigationRoute, d: number) => {
    const legs = r.legs || [];
    const leg = legs.find((l) => d >= l.startDistanceMeters && d <= l.startDistanceMeters + l.distanceMeters) || legs[legs.length - 1];
    if (!leg) return r.fromFloor;
    return leg.type === 'vertical' && d > leg.startDistanceMeters + leg.distanceMeters * 0.5 && leg.toFloor ? leg.toFloor : leg.floor;
  };

  const syncStep = (r: NavigationRoute, d: number) => {
    const idx = stepForDistance(r, d);
    if (idx !== stepRef.current) {
      stepRef.current = idx; setStepIndex(idx);
      if (voiceRef.current && spokenRef.current !== idx) { spokenRef.current = idx; speakGuidance(r.steps[idx].instruction); }
    }
    const f = floorForDistance(r, d);
    if (f !== planRef.current.floorNumber) goFloor(f);
  };

  // walk simulation loop
  useEffect(() => {
    if (!playing || !route) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const d = Math.min(route.totalDistanceMeters, walkedRef.current + dt * WALKING_SPEED_MPS);
      walkedRef.current = d;
      setWalked(d);
      syncStep(route, d);
      if (d >= route.totalDistanceMeters) {
        setPlaying(false);
        if (voiceRef.current) speakGuidance('You have arrived.');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, route]);

  // frame the useful part of the map: the route on this floor, else the start point (phones)
  const frameView = () => {
    const m = mapRef.current;
    if (!m) return;
    const f = currentPlan.floorNumber;
    const pts: Point[] = [];
    if (route) {
      for (const seg of route.floorSegments) if (seg.floor === f) pts.push(...seg.waypoints);
      if (startRoom && startRoom.floor === f) pts.push(startRoom.coords);
      if (endRoom && endRoom.floor === f) pts.push(endRoom.coords);
    }
    if (pts.length) m.fitPoints(pts, isMobile ? 6 : 3);
    else if (isMobile && startRoom && startRoom.floor === f) m.fitPoints([startRoom.coords, { x: startRoom.coords.x - 18, y: startRoom.coords.y }, { x: startRoom.coords.x + 18, y: startRoom.coords.y }], 6);
    else m.fit();
  };
  useEffect(() => {
    if (isNavigating) return;
    const t = setTimeout(frameView, 120);
    return () => clearTimeout(t);
  }, [route, currentPlan.id, isMobile, route ? '' : startRoom?.id]);

  const jumpToStep = (i: number) => {
    if (!route || i < 0 || i >= route.steps.length) return;
    const d = route.steps[i].cumulativeDistanceMeters ?? 0;
    walkedRef.current = d; setWalked(d);
    stepRef.current = i; setStepIndex(i);
    if (voiceRef.current) { spokenRef.current = i; speakGuidance(route.steps[i].instruction); }
    const f = route.steps[i].floor;
    if (f) goFloor(f);
    setFollow(true);
  };

  const startNavigation = () => {
    if (!route) return;
    walkedRef.current = 0; setWalked(0); stepRef.current = 0; setStepIndex(0); spokenRef.current = -1;
    goFloor(route.fromFloor);
    setInspected(null); setSearchOpen(false); setQuery('');
    setIsNavigating(true); setPlaying(true); setFollow(true);
    if (voice) speakGuidance(route.spokenOverview);
  };
  const endNavigation = () => { setIsNavigating(false); setPlaying(false); setTimeout(frameView, 80); };

  const showRoom = (r: RoomPOI) => {
    if (r.floor) goFloor(r.floor);
    const b = r.bounds;
    const pts: Point[] = b
      ? [{ x: b.x - 6, y: b.y - 10 }, { x: b.x + b.width + 6, y: b.y + b.height + 10 }]
      : [{ x: r.coords.x - 8, y: r.coords.y - 12 }, { x: r.coords.x + 8, y: r.coords.y + 12 }];
    setTimeout(() => mapRef.current?.fitPoints(pts, 8), 160);
  };
  const pickFromSearch = (r: RoomPOI) => {
    if (searchTarget === 'start') { setStartRoom(r); setSearchTarget('dest'); }
    else { setInspected(r); }
    setQuery(''); setSearchOpen(false); setSheetFull(false);
    showRoom(r);
  };
  const directionsTo = (r: RoomPOI) => { setEndRoom(r); setInspected(null); setSheetFull(false); if (startRoom) goFloor(startRoom.floor ?? currentPlan.floorNumber); };
  const startHere = (r: RoomPOI) => { setStartRoom(r); setInspected(null); };
  const swap = () => { const s = startRoom; setStartRoom(endRoom); setEndRoom(s); };
  const openSearch = (t: SearchTarget) => { setSearchTarget(t); setSearchOpen(true); setQuery(''); setInspected(null); setSheetFull(true); };

  const onTapRoom = (r: RoomPOI) => {
    const room = { ...r, floor: r.floor ?? currentPlan.floorNumber };
    if (isEditingMode) { setEditingRoom(room); return; }
    if (isNavigating) return;
    setInspected(room); setSearchOpen(false); setSheetFull(false);
    if (isMobile) showRoom(room);
  };

  // edits
  const persist = (id: string, patch: Partial<RoomPOI>) => {
    try {
      const o = loadOverrides();
      o[id] = { ...(o[id] || {}), ...patch };
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
    } catch { /* storage unavailable: edits last for this visit only */ }
  };
  const saveLookup = (room: RoomPOI, r: LookupResult) => {
    const patch: Partial<RoomPOI> = {
      name: r.name || room.name, category: r.category, purpose: r.purpose,
      sourceUrl: r.sources[0]?.url, sources: r.sources, lookupConfidence: r.confidence,
      purposeVerification: 'web_lookup_user_approved',
    };
    updateRoom({ ...room, ...patch });
  };
  const saveStaff = (room: RoomPOI, info: { name?: string; purpose: string; category?: POICategory; photo?: string }) => {
    updateRoom({
      ...room,
      name: info.name || room.name,
      purpose: info.purpose,
      category: info.category || room.category,
      photo: info.photo || room.photo,
      purposeVerification: 'staff_reported',
      reportedAt: new Date().toISOString(),
      sources: undefined, sourceUrl: undefined, lookupConfidence: undefined,
    });
  };
  const updateRoom = (updated: RoomPOI) => {
    const { id, name, category, purpose, coords, sourceUrl, sources, lookupConfidence, purposeVerification, accessible, notes, photo, reportedAt } = updated;
    persist(id, { name, category, purpose, coords, sourceUrl, sources, lookupConfidence, purposeVerification, accessible, notes, photo, reportedAt });
    setPlans((prev) => prev.map((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)) })));
    setCurrentPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)) }));
    if (inspected?.id === updated.id) setInspected((x) => (x ? { ...x, ...updated } : x));
  };
  const moveRoom = (id: string, coords: Point) => {
    const r = currentPlan.rooms.find((x) => x.id === id);
    if (r) updateRoom({ ...r, coords: { x: Math.round(coords.x * 100) / 100, y: Math.round(coords.y * 100) / 100 } });
  };

  const handleAddNewFloorPlan = async (imageDataUrl: string, buildingTypeHint?: string) => {
    const response = await fetch('/api/analyze-floorplan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: imageDataUrl, buildingTypeHint }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error || 'Failed to analyze floor plan with AI');
    }
    const newPlan: FloorPlanData = await response.json();
    newPlan.source = 'camera';
    setPlans((prev) => [newPlan, ...prev]);
    setCurrentPlan(newPlan);
  };

  const routeFloors = route ? route.floorSegments.map((s) => s.floor) : [];
  const floors = buildingPlans.map((p) => p.floorNumber);

  const actions = [
    { label: 'Ask AI', icon: Sparkles, on: () => setIsWayfinderOpen(true) },
    { label: 'Update a room', icon: Globe, on: () => { setLookupRoom(null); setLookupOpen(true); } },
    { label: 'Scan plan', icon: Camera, on: () => setIsCameraOpen(true) },
    { label: 'Upload plan', icon: Upload, on: () => setIsUploadOpen(true) },
    { label: isEditingMode ? 'Done editing' : 'Edit map', icon: Pencil, on: () => setIsEditingMode((v) => !v), active: isEditingMode },
    { label: 'Report', icon: Flag, on: () => { setReportingRoom(inspected || endRoom); setIsReportModalOpen(true); } },
    { label: 'Help', icon: CircleHelp, on: () => setIsHelpOpen(true) },
  ];

  const mapControls = (
    <div data-ui className="flex flex-col gap-2">
      <div className="bg-white rounded-2xl shadow-md ring-1 ring-slate-200 flex flex-col overflow-hidden">
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomBy(1.4)} className="w-11 h-11 flex items-center justify-center text-slate-700 hover:bg-slate-50"><Plus className="w-5 h-5" /></button>
        <div className="h-px bg-slate-200" />
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomBy(1 / 1.4)} className="w-11 h-11 flex items-center justify-center text-slate-700 hover:bg-slate-50"><Minus className="w-5 h-5" /></button>
      </div>
      {isNavigating ? (
        <button aria-label="Follow" onClick={() => setFollow(true)} className={cx('w-11 h-11 rounded-2xl shadow-md ring-1 ring-slate-200 flex items-center justify-center', follow ? 'bg-blue-600 text-white' : 'bg-white text-slate-700')}>
          <LocateFixed className="w-5 h-5" />
        </button>
      ) : (
        <button aria-label="Fit map" onClick={() => mapRef.current?.fit()} onDoubleClick={frameView} className="w-11 h-11 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 flex items-center justify-center text-slate-700"><Maximize className="w-5 h-5" /></button>
      )}
      {currentPlan.originalImageUrl && (
        <button aria-label={showOriginal ? 'Show clean map' : 'Show original drawing'} title={showOriginal ? 'Clean map' : 'Original drawing'} onClick={() => setShowOriginal((v) => !v)}
          className={cx('w-11 h-11 rounded-2xl shadow-md ring-1 ring-slate-200 flex items-center justify-center', showOriginal ? 'bg-amber-100 text-amber-800' : 'bg-white text-slate-700')}>
          <FileImage className="w-5 h-5" />
        </button>
      )}
      {!isMobile && (
        <button aria-label="Show hallway network" title="Hallway network" onClick={() => setShowGraph((v) => !v)}
          className={cx('w-11 h-11 rounded-2xl shadow-md ring-1 ring-slate-200 flex items-center justify-center', showGraph ? 'bg-sky-100 text-sky-800' : 'bg-white text-slate-700')}>
          <Layers className="w-5 h-5" />
        </button>
      )}
    </div>
  );

  const map = (pad: { top: number; right: number; bottom: number; left: number }) => (
    <MapView
      ref={mapRef}
      plan={currentPlan}
      route={route}
      walkedMeters={walked}
      showWalker={isNavigating}
      followWalker={isNavigating && follow}
      onUserMoved={() => isNavigating && setFollow(false)}
      startRoom={startRoom}
      endRoom={endRoom}
      selectedRoom={inspected}
      showOriginal={showOriginal}
      showGraph={showGraph}
      editing={isEditingMode}
      onTapRoom={onTapRoom}
      onTapEmpty={() => { setInspected(null); setSheetFull(false); }}
      onMoveRoom={moveRoom}
      padding={pad}
    />
  );

  const quickChips = (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {QUICK.map((c) => (
        <button key={c.q} onClick={() => { setSearchTarget('dest'); setSearchOpen(true); setQuery(c.q); setSheetFull(true); }}
          className="shrink-0 h-9 px-3 rounded-full bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50">
          <c.icon className="w-4 h-4" /> {c.label}
        </button>
      ))}
    </div>
  );

  const planner = (compact: boolean) => (
    <RoutePlanner
      start={startRoom} end={endRoom} route={route} accessible={isAccessibleOnly} voice={voice}
      onEditStart={() => openSearch('start')} onEditEnd={() => openSearch('dest')} onSwap={swap}
      onToggleAccessible={() => setIsAccessibleOnly((v) => !v)} onToggleVoice={() => setVoice((v) => !v)}
      onStart={startNavigation} compactSteps={compact} current={stepIndex}
      onPickStep={(i) => { jumpToStep(i); }}
    />
  );

  const roomCard = (r: RoomPOI, onClose?: () => void) => (
    <RoomCard room={r} onClose={onClose} onDirections={() => directionsTo(r)} onStartHere={() => startHere(r)}
      onEdit={() => setEditingRoom(r)} onReport={() => { setReportingRoom(r); setIsReportModalOpen(true); }}
      onLookup={() => { setLookupRoom(r); setLookupOpen(true); }} />
  );

  const editBanner = isEditingMode && (
    <div data-ui className="bg-amber-50 ring-1 ring-amber-300 text-amber-900 text-sm rounded-xl px-3 py-2 shadow flex items-center gap-2">
      <Pencil className="w-4 h-4 shrink-0" />
      <span className="flex-1">Edit mode: drag a room label to move it, tap a room to edit its details.</span>
      <button onClick={() => setIsEditingMode(false)} className="font-bold">Done</button>
    </div>
  );

  const modals = (
    <>
      <FloorPlanEditorModal isOpen={!!editingRoom} room={editingRoom} onClose={() => setEditingRoom(null)} onSaveRoom={(r) => { updateRoom(r); setEditingRoom(null); }} />
      <ReportDiscrepancyModal isOpen={isReportModalOpen} room={reportingRoom} onClose={() => setIsReportModalOpen(false)} />
      <Assistant
        open={isWayfinderOpen}
        onClose={() => setIsWayfinderOpen(false)}
        plan={currentPlan}
        plans={buildingPlans}
        start={startRoom}
        accessible={isAccessibleOnly}
        isE5={buildingId === 'uwaterloo-e5'}
        onGo={(r) => directionsTo(r)}
        onLookup={() => { setLookupRoom(null); setLookupOpen(true); }}
      />
      <RoomLookup
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        buildingName={currentPlan.buildingName || currentPlan.title}
        rooms={allRooms}
        initialRoom={lookupRoom}
        onSave={saveLookup}
        onSaveStaff={saveStaff}
        onShowRoom={(r) => { setLookupOpen(false); const fresh = plansRef.current.flatMap((p) => p.rooms.map((x) => ({ ...x, floor: x.floor ?? p.floorNumber }))).find((x) => x.id === r.id) || r; setInspected(fresh); showRoom(fresh); }}
      />
      <CameraCaptureModal isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCaptureComplete={handleAddNewFloorPlan}
        onSwitchToUpload={() => { setIsCameraOpen(false); setIsUploadOpen(true); }} />
      <UploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} onUploadComplete={handleAddNewFloorPlan} />
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );

  const buildingSelect = buildings.length > 1 && (
    <select
      value={buildingId}
      onChange={(e) => { const p = plans.find((x) => (x.buildingId || x.id) === e.target.value); if (p) { setCurrentPlan(p); setInspected(null); } }}
      className="h-9 rounded-lg bg-slate-100 px-2 text-sm font-semibold text-slate-800 outline-none max-w-[220px]"
    >
      {buildings.map((b) => <option key={b.buildingId || b.id} value={b.buildingId || b.id}>{b.buildingName || b.title}</option>)}
    </select>
  );

  /* ======================= DESKTOP ======================= */
  if (!isMobile) {
    return (
      <div className="h-[100dvh] w-screen flex flex-col bg-white text-slate-900 font-sans antialiased overflow-hidden">
        <header className="h-14 shrink-0 border-b border-slate-200 flex items-center gap-3 px-4">
          <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center"><Compass className="w-5 h-5 text-slate-900" /></div>
          <span className="font-extrabold text-lg tracking-tight">FloorNav</span>
          <span className="text-slate-300">|</span>
          {buildingSelect || <span className="text-sm font-semibold text-slate-600">{currentPlan.buildingName || currentPlan.title}</span>}
          <div className="flex-1" />
          {actions.map((a) => (
            <button key={a.label} onClick={a.on}
              className={cx('h-9 px-3 rounded-lg text-sm font-semibold flex items-center gap-1.5', a.active ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100')}>
              <a.icon className="w-4 h-4" /> {a.label}
            </button>
          ))}
        </header>

        <div className="flex-1 min-h-0 flex">
          <aside className="w-[400px] shrink-0 border-r border-slate-200 flex flex-col min-h-0">
            <div className="p-4 pb-2 space-y-2">
              <SearchInput
                value={query}
                onChange={(v) => { setQuery(v); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onClear={() => setSearchOpen(false)}
                placeholder={searchTarget === 'start' ? 'Search for a starting point' : 'Search rooms, labs, washrooms…'}
                autoFocus={searchTarget === 'start'}
                leading={searchTarget === 'start' ? <button onClick={() => { setSearchTarget('dest'); setSearchOpen(false); }}><ChevronLeft className="w-5 h-5 text-slate-500" /></button> : undefined}
              />
              {!query && !isNavigating && quickChips}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
              {searchOpen && query ? (
                <div className="-mx-4"><SearchResults results={results} onPick={pickFromSearch} emptyHint="No matching rooms" /></div>
              ) : isNavigating && route ? (
                <div className="space-y-3 pt-2">
                  <RouteSummary route={route} />
                  <p className="text-sm text-slate-500">{roomTitle(startRoom!)} → {roomTitle(endRoom!)}</p>
                  <StepsList route={route} current={stepIndex} onPick={jumpToStep} />
                </div>
              ) : inspected ? (
                <div className="pt-2">{roomCard(inspected, () => setInspected(null))}</div>
              ) : (
                <div className="pt-2 space-y-4">
                  {planner(false)}
                  {!endRoom && <p className="text-sm text-slate-500">Search for a room or tap one on the map, then press <b>Directions</b>.</p>}
                </div>
              )}
            </div>
          </aside>

          <main className="relative flex-1 min-w-0">
            {map({ top: isNavigating ? 150 : 24, right: 80, bottom: isNavigating ? 110 : 24, left: 24 })}
            <div className="absolute top-4 right-4"><FloorPicker floors={floors} current={currentPlan.floorNumber} onPick={goFloor} routeFloors={routeFloors} vertical /></div>
            <div className="absolute bottom-4 right-4">{mapControls}</div>
            <div className="absolute top-4 left-4 pointer-events-none">
              <div className="bg-white/90 backdrop-blur rounded-xl px-3 py-1.5 shadow ring-1 ring-slate-200 text-sm">
                <span className="font-bold">Floor {currentPlan.floorNumber}</span>
                {currentPlan.subTitle && <span className="text-slate-500"> · {currentPlan.subTitle}</span>}
              </div>
            </div>
            {isNavigating && route && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[min(560px,calc(100%-180px))]">
                <NavBanner route={route} index={stepIndex} onPrev={() => jumpToStep(stepIndex - 1)} onNext={() => jumpToStep(stepIndex + 1)} />
              </div>
            )}
            {isNavigating && route && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(560px,calc(100%-180px))]">
                <NavFooter route={route} walked={walked} playing={playing} onPlayPause={() => setPlaying((p) => !p)}
                  onRestart={() => { walkedRef.current = 0; setWalked(0); jumpToStep(0); setPlaying(true); }} onEnd={endNavigation}
                  voice={voice} onVoice={() => setVoice((v) => !v)} />
              </div>
            )}
            {isEditingMode && <div className="absolute top-16 left-4 right-24">{editBanner}</div>}
          </main>
        </div>
        {modals}
      </div>
    );
  }

  /* ======================= PHONE ======================= */
  const sheetContent = (() => {
    if (searchOpen) {
      return (
        <div className="-mx-4">
          {query ? <SearchResults results={results} onPick={pickFromSearch} emptyHint="No matching rooms" /> : <div className="px-4">{quickChips}</div>}
        </div>
      );
    }
    if (inspected) return roomCard(inspected, () => setInspected(null));
    if (endRoom) {
      if (!sheetFull && route) {
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500 truncate">To {roomTitle(endRoom)}</p>
                <RouteSummary route={route} />
              </div>
              <button onClick={startNavigation} className="h-12 px-6 rounded-full bg-blue-600 text-white font-bold shadow">Start</button>
            </div>
            <button onClick={() => setSheetFull(true)} className="text-sm font-semibold text-blue-700">Route options and steps</button>
          </div>
        );
      }
      return planner(false);
    }
    return (
      <div className="space-y-2">
        <p className="text-[15px] font-bold text-slate-900">Where to?</p>
        {quickChips}
        <p className="text-xs text-slate-500">Or tap any room on the map.</p>
      </div>
    );
  })();

  return (
    <div className="h-[100dvh] w-screen relative bg-slate-100 text-slate-900 font-sans antialiased overflow-hidden">
      <div className="absolute inset-0">
        {map({ top: isNavigating ? 170 : 124, right: 64, bottom: isNavigating ? 110 : Math.min(sheetH, 360) + 12, left: 12 })}
      </div>

      {/* top */}
      <div className="absolute top-0 left-0 right-0 p-3 pt-[max(12px,env(safe-area-inset-top))] space-y-2 pointer-events-none">
        {isNavigating && route ? (
          <div className="pointer-events-auto">
            <NavBanner route={route} index={stepIndex} onPrev={() => jumpToStep(stepIndex - 1)} onNext={() => jumpToStep(stepIndex + 1)} />
          </div>
        ) : (
          <>
            <div className="pointer-events-auto">
              <SearchInput
                value={query}
                onChange={(v) => { setQuery(v); setSearchOpen(true); setSheetFull(true); }}
                onFocus={() => { setSearchOpen(true); setSheetFull(true); setInspected(null); }}
                placeholder={searchTarget === 'start' ? 'Search a starting point' : 'Search E5 rooms'}
                leading={
                  searchOpen ? (
                    <button aria-label="Back" onClick={() => { setSearchOpen(false); setQuery(''); setSearchTarget('dest'); setSheetFull(false); }} className="p-1 -ml-1"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
                  ) : (
                    <button aria-label="Menu" onClick={() => setMenuOpen(true)} className="p-1 -ml-1"><Menu className="w-5 h-5 text-slate-600" /></button>
                  )
                }
              />
            </div>
            {!searchOpen && (
              <div className="pointer-events-auto flex items-center gap-2">
                <FloorPicker floors={floors} current={currentPlan.floorNumber} onPick={goFloor} routeFloors={routeFloors} />
              </div>
            )}
            {editBanner && <div className="pointer-events-auto">{editBanner}</div>}
          </>
        )}
      </div>

      {/* right controls */}
      {!searchOpen && (
        <div className="absolute right-3 transition-[bottom] duration-200" style={{ bottom: isNavigating ? 112 : sheetH + 12 }}>{mapControls}</div>
      )}
      {isNavigating && (
        <div className="absolute left-3 bottom-[112px]">
          <div className="bg-white rounded-xl shadow-md ring-1 ring-slate-200 px-3 py-2 text-sm font-bold">Floor {currentPlan.floorNumber}</div>
        </div>
      )}

      {/* bottom */}
      {isNavigating && route ? (
        <div className="absolute bottom-0 left-0 right-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <NavFooter route={route} walked={walked} playing={playing} onPlayPause={() => setPlaying((p) => !p)}
            onRestart={() => { walkedRef.current = 0; setWalked(0); jumpToStep(0); setPlaying(true); }} onEnd={endNavigation}
            voice={voice} onVoice={() => setVoice((v) => !v)} />
        </div>
      ) : (
        <div
          ref={sheetRef}
          data-ui
          className={cx(
            'absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(15,23,42,0.15)] flex flex-col transition-[max-height] duration-200',
            sheetFull || searchOpen ? 'max-h-[calc(100dvh-80px)] h-[calc(100dvh-80px)]' : 'max-h-[45dvh]'
          )}
        >
          <button aria-label={sheetFull ? 'Collapse' : 'Expand'} onClick={() => { if (searchOpen) return; setSheetFull((v) => !v); }} className="w-full pt-2 pb-1 flex justify-center shrink-0">
            <span className="w-10 h-1.5 rounded-full bg-slate-300" />
          </button>
          <div className="overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1 min-h-0 flex-1">{sheetContent}</div>
        </div>
      )}

      {/* menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40" onClick={() => setMenuOpen(false)}>
          <div className="bg-white rounded-t-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center"><Compass className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold">FloorNav</p>
                <p className="text-sm text-slate-500 truncate">{currentPlan.buildingName || currentPlan.title}</p>
              </div>
              <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            {buildingSelect}
            <div className="grid grid-cols-3 gap-2">
              {actions.map((a) => (
                <button key={a.label} onClick={() => { setMenuOpen(false); a.on(); }}
                  className={cx('h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-sm font-semibold', a.active ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700')}>
                  <a.icon className="w-5 h-5" /> {a.label}
                </button>
              ))}
            </div>
            <button onClick={() => { setMenuOpen(false); setIsAccessibleOnly((v) => !v); }} className="w-full h-12 rounded-2xl bg-slate-100 flex items-center gap-2 px-4 text-sm font-semibold">
              <Accessibility className="w-5 h-5" /> {isAccessibleOnly ? 'Routes use elevators only' : 'Routes may use stairs'}
            </button>
          </div>
        </div>
      )}
      {modals}
    </div>
  );
}

