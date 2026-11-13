/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass, Sparkles, Pencil, CircleHelp, MapPinned, Move, Plus, Minus, Maximize, Layers, FileImage, Menu, X,
  LocateFixed, ChevronLeft, Accessibility, Bath, ArrowUpDown, GraduationCap, FlaskConical, DoorOpen, Globe,
  Briefcase, Wrench, Printer, Coffee, Tv, ShieldAlert, Phone, CheckCircle2, ChevronRight, AlertTriangle, Navigation2, Map as MapIcon,
  ScanLine, ClipboardCheck, ListChecks, WifiOff,
} from 'lucide-react';
import { CampusView } from './components/campus/CampusView';
import { SAMPLE_FLOOR_PLANS } from './data/sampleFloorPlans';
import { FloorPlanData, RoomPOI, Point, NavigationRoute, POICategory, IndoorLocationState, QRCheckpoint } from './types/navigation';
import { CameraSignScannerModal } from './components/CameraSignScannerModal';
import { GoogleMapsHandoffModal } from './components/GoogleMapsHandoffModal';
import { CorrectionsAuditModal } from './components/CorrectionsAuditModal';
import { E5ValidationModal } from './components/E5ValidationModal';
import { resolveCheckpoint } from './data/e5/checkpoints';
import { hydrateSuggestions } from './utils/auditLog';
import { pullStore, pushStore } from './utils/serverStore';
import { FloorImport, importToPlan, verticalLinksFor } from './campus/floorImports';
import { buildingById } from './campus/campusData';
import { calculateIndoorRoute } from './utils/pathfinding';
import { speakGuidance } from './utils/speech';
import { FloorPlanEditorModal } from './components/FloorPlanEditorModal';
import { RoomReport, loadReports, saveReports, reportLabel, routeClosures } from './utils/reports';
import { E5_VERTICAL_LINKS } from './data/e5/e5DataLoader';
import { Assistant } from './components/Assistant';
import { UpdateMap, WebResult } from './components/UpdateMap';
import { Tour, tourSeen } from './components/Tour';
import { MapView, MapViewHandle } from './components/MapView';
import {
  cx, buildingCode, FloorPicker, NavBanner, NavFooter, RoomCard, RoutePlanner, RouteSummary, SearchInput, SearchResults, StepsList, useRoomSearch, roomTitle,
} from './components/Panels';
import { MicButton } from './components/MicButton';
import { OnboardingRoleModal } from './components/OnboardingRoleModal';
import { WorkplaceCompanionModal } from './components/WorkplaceCompanionModal';
import { WorkplaceIssueModal } from './components/WorkplaceIssueModal';
import { StaffRole, STAFF_ROLES, DAY1_TOURS, ONBOARDING_TASKS, OnboardingTask } from './data/waterlooStaffData';

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
  { label: 'Classrooms', q: 'classroom', icon: GraduationCap },
  { label: 'uPrint & Mail', q: 'print', icon: Printer },
  { label: 'Staff Lounges', q: 'lounge', icon: Coffee },
  { label: 'AV & IT Help', q: 'av', icon: Tv },
  { label: 'AED & Safety', q: 'emergency', icon: ShieldAlert },
  { label: 'Washrooms', q: 'washroom', icon: Bath },
  { label: 'Elevators', q: 'elevator', icon: ArrowUpDown },
  { label: 'Bridges & Doors', q: 'bridge', icon: DoorOpen },
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
  // 'campus' = Google Maps campus view, 'indoor' = the floor-plan navigator. Route state is shared.
  const [view, setView] = useState<'campus' | 'indoor'>('campus');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [reports, setReports] = useState<RoomReport[]>(() => loadReports());
  const changeReports = (f: (l: RoomReport[]) => RoomReport[]) => setReports((l) => { const n = f(l); saveReports(n); return n; });
  const [lookupRoom, setLookupRoom] = useState<RoomPOI | null>(null);
  // Where the user is. Only a checkpoint or sign scan says more than "you picked this spot";
  // no accuracy figure is shown because nothing here measures one.
  const [locationState, setLocationState] = useState<IndoorLocationState | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [floorImports, setFloorImports] = useState<FloorImport[]>([]);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  // Shared map data from the server: imported floors, room edits, reports, corrections.
  const loadImports = () => fetch('/api/floor-imports').then((r) => (r.ok ? r.json() : [])).then((l) => setFloorImports(Array.isArray(l) ? l : [])).catch(() => {});
  useEffect(() => {
    loadImports();
    hydrateSuggestions();
    pullStore<Overrides>('roomOverrides').then((o) => {
      if (!o || !Object.keys(o).length) return;
      try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o)); } catch { /* storage blocked */ }
      setPlans((prev) => applyOverrides(prev, o));
      setCurrentPlan((p) => applyOverrides([p], o)[0]);
    });
    pullStore<RoomReport[]>('reports').then((l) => { if (Array.isArray(l)) { setReports(l); try { localStorage.setItem('floornav.reports.v1', JSON.stringify(l)); } catch { /* */ } } });
    const on = () => setIsOffline(false), off = () => setIsOffline(true);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    fetch('/api/health').then((r) => setIsOffline(!r.ok)).catch(() => setIsOffline(true));
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  // Published imports become ordinary floors of an "import-<building>" building.
  useEffect(() => {
    // Room edits made in the app (names, purposes, moves) are stored as overrides by room id; apply them to imported floors too.
    const imported = applyOverrides(floorImports.filter((f) => f.published).map((f) => importToPlan(f, buildingById(f.buildingId)?.name || f.buildingId)), loadOverrides());
    setPlans((prev) => [...prev.filter((p) => !p.id.startsWith('import-')), ...imported]);
  }, [floorImports]);

  const [startRoom, setStartRoom] = useState<RoomPOI | null>(null);
  const [endRoom, setEndRoom] = useState<RoomPOI | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
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
  const [isWayfinderOpen, setIsWayfinderOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Waterloo Staff Role & Workplace Companion state
  const ROLE_STORAGE_KEY = 'floornav.staffRole.v1';
  const TASKS_STORAGE_KEY = 'floornav.completedTasks.v1';

  const [staffRole, setStaffRole] = useState<StaffRole>(() => {
    try {
      const stored = localStorage.getItem(ROLE_STORAGE_KEY) as StaffRole;
      return stored && STAFF_ROLES[stored] ? stored : 'instructor';
    } catch {
      return 'instructor';
    }
  });
  const [roleModalOpen, setRoleModalOpen] = useState(() => {
    try {
      return !localStorage.getItem(ROLE_STORAGE_KEY);
    } catch {
      return false;
    }
  });
  const [workplaceCompanionOpen, setWorkplaceCompanionOpen] = useState(false);
  const [workplaceIssueOpen, setWorkplaceIssueOpen] = useState(false);
  const [issueRoomId, setIssueRoomId] = useState<string | null>(null);
  const [issueCategory, setIssueCategory] = useState<string | undefined>(undefined);
  const [safetyOverlayActive, setSafetyOverlayActive] = useState(false);

  const [completedTasks, setCompletedTasks] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(TASKS_STORAGE_KEY) || '[]') || [];
    } catch {
      return [];
    }
  });

  const toggleTask = (id: string) => {
    setCompletedTasks((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      try { localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleSelectRole = (newRole: StaffRole, startTourImmediately = false) => {
    setStaffRole(newRole);
    try { localStorage.setItem(ROLE_STORAGE_KEY, newRole); } catch { /* ignore */ }
    setRoleModalOpen(false);
    if (startTourImmediately) {
      setTimeout(() => startDay1Tour(newRole), 120);
    }
  };

  // Day 1 Guided Tour state
  const [day1TourIndex, setDay1TourIndex] = useState<number | null>(null);
  const activeTourStops = useMemo(() => DAY1_TOURS[staffRole] || DAY1_TOURS.instructor, [staffRole]);

  const startDay1Tour = (roleForTour?: StaffRole) => {
    const stops = DAY1_TOURS[roleForTour || staffRole] || DAY1_TOURS.instructor;
    if (!stops.length) return;
    setWorkplaceCompanionOpen(false);
    setRoleModalOpen(false);
    setDay1TourIndex(0);
    goToTourStop(stops[0]);
  };

  const goToTourStop = (stop: { id: string; name: string; roomId: string; floor: number; title: string }) => {
    const targetRoom = allRooms.find((r) => r.id === stop.roomId || (r.roomNumber && stop.roomId.includes(r.roomNumber))) || {
      id: stop.roomId,
      name: stop.name,
      coords: { x: 50, y: 50 },
      floor: stop.floor,
      category: 'other' as const,
    };
    if (stop.floor !== currentPlan.floorNumber) {
      goFloor(stop.floor);
    }
    setEndRoom(targetRoom);
    showRoom(targetRoom);
  };

  const advanceTour = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= activeTourStops.length) {
      setDay1TourIndex(null);
      return;
    }
    setDay1TourIndex(nextIndex);
    goToTourStop(activeTourStops[nextIndex]);
  };

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
    const inHere = (r: RoomPOI | null) => !!r && buildingPlans.some((p) => p.rooms.some((x) => x.id === r.id));
    if (inHere(startRoom)) { if (endRoom && !inHere(endRoom)) setEndRoom(null); return; }
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
    if (!startRoom || !endRoom || startRoom.id === endRoom.id) { setRoute(null); setRouteError(null); return; }
    const sFloor = startRoom.floor ?? currentPlan.floorNumber;
    const eFloor = endRoom.floor ?? currentPlan.floorNumber;
    const sPlan = buildingPlans.find((p) => p.floorNumber === sFloor) || currentPlan;
    let r: NavigationRoute;
    try {
      r = calculateIndoorRoute(sPlan, startRoom.coords, startRoom.name, endRoom.coords, endRoom.name, startRoom.id, endRoom.id, {
        isAccessibleOnly, allFloors: buildingPlans, startFloor: sFloor, endFloor: eFloor,
        closures: routeClosures(reports, buildingPlans, E5_VERTICAL_LINKS),
        // Imported buildings: stairs and elevators matched by room number across their drawn floors.
        verticalLinks: buildingId === 'uwaterloo-e5' ? undefined : verticalLinksFor(buildingPlans),
      });
      if (sPlan.source === 'upload') r.flaggedNotes = ['Route follows hallways drawn on the Plant Operations plan; stairs and elevators matched by room number. Not walked.', ...(r.flaggedNotes || [])];
    } catch (e: any) { setRoute(null); setRouteError(e?.message || 'No route found.'); return; }
    setRouteError(null);
    setRoute(r);
    setStepIndex(0); stepRef.current = 0; spokenRef.current = -1;
    setWalked(0); walkedRef.current = 0;
  }, [startRoom, endRoom, isAccessibleOnly, buildingPlans, reports]);

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
    if (searchTarget === 'start') { setStartRoom(r); manualLocation(r); setSearchTarget('dest'); }
    else { setInspected(r); }
    setQuery(''); setSearchOpen(false); setSheetFull(false);
    showRoom(r);
  };
  const directionsTo = (r: RoomPOI) => { setEndRoom(r); setInspected(null); setSheetFull(false); if (startRoom) goFloor(startRoom.floor ?? currentPlan.floorNumber); };
  const manualLocation = (r: RoomPOI) => setLocationState({ status: 'manual', accuracyRadiusMeters: 0, source: 'manual_room', coords: r.coords, floor: r.floor ?? currentPlan.floorNumber, roomId: r.id, roomNumber: r.roomNumber, roomName: r.name, updatedAt: Date.now() });
  const startHere = (r: RoomPOI) => { setStartRoom(r); manualLocation(r); setInspected(null); };
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
  const openUpdate = (r: RoomPOI | null) => { setLookupRoom(r); setLookupOpen(true); };
  const persist = (id: string, patch: Partial<RoomPOI>) => {
    try {
      const o = loadOverrides();
      o[id] = { ...(o[id] || {}), ...patch };
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
      pushStore('roomOverrides', o);
    } catch { /* storage unavailable: edits last for this visit only */ }
  };
  const saveLookup = (room: RoomPOI, r: WebResult) => {
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

  /* ---- Position from QR checkpoints and sign photos (from the Nov 6 FloorNav) ---- */
  const recenterOnUser = () => {
    if (!locationState) return;
    if (locationState.floor !== currentPlan.floorNumber) goFloor(locationState.floor);
    setTimeout(() => mapRef.current?.focusPoint(locationState.coords, 0.45), 160);
  };
  const handleConfirmCheckpoint = (chk: QRCheckpoint | { roomId: string; roomNumber: string; name: string; floor: number; coords: Point }) => {
    const isQr = 'code' in chk;
    // Use the room's own position when the room exists; checkpoint coordinates are only a fallback.
    const room = allRooms.find((r) => r.id === chk.roomId) || allRooms.find((r) => chk.roomNumber && r.roomNumber === chk.roomNumber);
    const floor = room?.floor ?? chk.floor;
    const coords = room?.coords ?? chk.coords;
    setLocationState({
      status: isQr ? 'confirmed' : 'estimated', accuracyRadiusMeters: 0, source: isQr ? 'qr_checkpoint' : 'sign_camera',
      coords, floor, roomId: room?.id, roomNumber: room?.roomNumber ?? chk.roomNumber, roomName: room?.name ?? chk.name,
      checkpointCode: isQr ? chk.code : undefined, updatedAt: Date.now(),
    });
    setStartRoom(room || { id: `pos-${Date.now()}`, name: chk.name, roomNumber: chk.roomNumber, category: 'other', coords, floor });
    if (floor !== currentPlan.floorNumber) goFloor(floor);
    // The route effect recalculates from the new start; say so when guiding.
    if (isNavigating && voice) speakGuidance(`Position updated at ${room?.roomNumber || chk.name}. Route updated.`);
    setTimeout(() => mapRef.current?.focusPoint(coords, 0.45), 160);
  };
  const handleSelectEntrance = (entranceId: string, floor: number) => {
    const e = allRooms.find((r) => r.id === entranceId);
    if (!e) return;
    goFloor(floor);
    startHere(e);
  };
  const applyValidationScenario = (num: number) => {
    const byNum = (n: string) => allRooms.find((r) => r.roomNumber === n);
    switch (num) {
      case 1: { const e = byNum('2811'); if (e) { goFloor(2); startHere(e); setEndRoom(null); showRoom(e); } break; }
      case 2: recenterOnUser(); break;
      case 3: { const r = byNum('3101'); if (r) { setInspected(r); showRoom(r); } break; }
      case 4: { const s = byNum('2811'), d = byNum('3101'); if (s && d) { startHere(s); setEndRoom(d); goFloor(2); } break; }
      case 5: startNavigation(); setPlaying(false); break;
      case 6: { const chk = resolveCheckpoint('E5-L2-ATRIUM'); if (chk) handleConfirmCheckpoint(chk); break; }
      case 7: { const g = byNum('2108'); if (g) handleConfirmCheckpoint({ roomId: g.id, roomNumber: '2108', name: g.name, floor: g.floor ?? 2, coords: g.coords }); break; }
      case 8: setIsAccessibleOnly((v) => !v); break;
      case 9: setIsWayfinderOpen(true); break;
      case 10: setScannerOpen(true); break;
      case 11: setIsOffline(true); break;
    }
  };

  const routeFloors = route ? route.floorSegments.map((s) => s.floor) : [];
  const floors = buildingPlans.map((p) => p.floorNumber);
  const floorLabels = Object.fromEntries(buildingPlans.filter((p) => p.floorLabel).map((p) => [p.floorNumber, p.floorLabel!]));

  const actions = [
    { label: 'Workplace Companion', icon: Briefcase, on: () => setWorkplaceCompanionOpen(true), active: workplaceCompanionOpen },
    { label: 'Report Issue', icon: AlertTriangle, on: () => { setIssueRoomId(inspected?.id || null); setWorkplaceIssueOpen(true); } },
    { label: 'Ask AI', icon: Sparkles, on: () => setIsWayfinderOpen(true) },
    { label: 'Scan a sign or QR', icon: ScanLine, on: () => setScannerOpen(true) },
    { label: 'Corrections & review', icon: ClipboardCheck, on: () => setAuditModalOpen(true) },
    ...(buildingId === 'uwaterloo-e5' ? [{ label: 'E5 self-checks', icon: ListChecks, on: () => setValidationModalOpen(true) }, { label: 'Outside? Walk to E5', icon: Navigation2, on: () => setHandoffOpen(true) }] : []),
    { label: 'Update the map', icon: MapPinned, on: () => openUpdate(inspected || null) },
    { label: isEditingMode ? 'Done moving' : 'Move rooms', icon: Move, on: () => setIsEditingMode((v) => !v), active: isEditingMode },
    { label: 'Show the tour', icon: CircleHelp, on: () => setTourOpen(true) },
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
      {locationState && !isNavigating && (
        <button aria-label="Show my position" title="Show my position" onClick={recenterOnUser}
          className="w-11 h-11 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 flex items-center justify-center text-blue-600"><LocateFixed className="w-5 h-5" /></button>
      )}
      <button
        aria-label={safetyOverlayActive ? 'Hide safety overlay' : 'Show safety & emergency overlay'}
        title={safetyOverlayActive ? 'Hide safety pins' : 'Show AEDs, First Aid & emergency exits'}
        onClick={() => setSafetyOverlayActive((v) => !v)}
        className={cx('w-11 h-11 rounded-2xl shadow-md ring-1 ring-slate-200 flex items-center justify-center transition-colors', safetyOverlayActive ? 'bg-rose-600 text-white ring-rose-500' : 'bg-white text-slate-700 hover:bg-slate-50')}
      >
        <ShieldAlert className="w-5 h-5" />
      </button>
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
      showSafetyOverlay={safetyOverlayActive}
      locationState={locationState}
      onSwitchFloorRequest={goFloor}
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

  const planner = (compact: boolean) => (<>
    {routeError && <p role="alert" className="mb-2 text-xs font-semibold text-red-800 bg-red-50 rounded-lg p-2">{routeError}</p>}
    <RoutePlanner
      start={startRoom} end={endRoom} route={route} accessible={isAccessibleOnly} voice={voice}
      onEditStart={() => openSearch('start')} onEditEnd={() => openSearch('dest')} onSwap={swap}
      onToggleAccessible={() => setIsAccessibleOnly((v) => !v)} onToggleVoice={() => setVoice((v) => !v)}
      onStart={startNavigation} onOpenScanner={() => setScannerOpen(true)} compactSteps={compact} current={stepIndex}
      onPickStep={(i) => { jumpToStep(i); }}
    />
  </>
  );

  const roomCard = (r: RoomPOI, onClose?: () => void) => (
    <RoomCard room={r} onClose={onClose} onDirections={() => directionsTo(r)} onStartHere={() => startHere(r)}
      onEdit={() => setEditingRoom(r)} onReport={() => openUpdate(r)}
      onLookup={() => openUpdate(r)}
      reports={reports.filter((x) => x.roomId === r.id).map((x) => ({ id: x.id, label: reportLabel(x.type), details: x.details, createdAt: x.createdAt, confirmations: x.confirmations }))}
      onConfirmReport={(id) => changeReports((l) => l.map((x) => (x.id === id ? { ...x, confirmations: x.confirmations + 1, createdAt: new Date().toISOString() } : x)))}
      onFixReport={(id) => changeReports((l) => l.filter((x) => x.id !== id))} />
  );

  const editBanner = isEditingMode && (
    <div data-ui className="bg-amber-50 ring-1 ring-amber-300 text-amber-900 text-sm rounded-xl px-3 py-2 shadow flex items-center gap-2">
      <Pencil className="w-4 h-4 shrink-0" />
      <span className="flex-1">Move rooms: drag a room label to where the room really is. Tap a room to edit its details.</span>
      <button onClick={() => setIsEditingMode(false)} className="font-bold">Done</button>
    </div>
  );

  const offlineBanner = isOffline && (
    <div data-ui role="status" className="bg-amber-600 text-white text-xs px-3 py-1.5 rounded-full shadow flex items-center gap-1.5 self-start">
      <WifiOff className="w-3.5 h-3.5" /> Offline: saved maps and routing still work; AI, sign reading and syncing do not.
    </div>
  );

  const modals = (
    <>
      <FloorPlanEditorModal isOpen={!!editingRoom} room={editingRoom} onClose={() => setEditingRoom(null)} onSaveRoom={(r) => { updateRoom(r); setEditingRoom(null); }} />
      <Assistant
        open={isWayfinderOpen}
        onClose={() => setIsWayfinderOpen(false)}
        plan={currentPlan}
        plans={buildingPlans}
        start={startRoom}
        destination={endRoom}
        route={route}
        locationState={locationState}
        accessible={isAccessibleOnly}
        isE5={buildingId === 'uwaterloo-e5'}
        onGo={(r) => directionsTo(r)}
        onSetStartRoom={(r) => startHere(r)}
        onSwitchFloor={(f) => goFloor(f)}
        onSetCheckpoint={(code) => { const chk = resolveCheckpoint(code); if (chk) handleConfirmCheckpoint(chk); }}
        onReroute={() => { if (locationState?.roomId) { const r = allRooms.find((x) => x.id === locationState.roomId); if (r) setStartRoom({ ...r }); } }}
        onLookup={() => openUpdate(null)}
        onReportIssue={(issue) => changeReports((l) => [{
          id: `rep-${Date.now()}`, roomId: issue.roomId || null,
          roomLabel: issue.roomId ? (allRooms.find((r) => r.id === issue.roomId)?.name || issue.roomId) : (currentPlan.buildingName || 'Building'),
          floor: currentPlan.floorNumber, type: issue.type as RoomReport['type'], details: issue.details, createdAt: new Date().toISOString(), confirmations: 1,
        }, ...l])}
      />
      <CameraSignScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} activeFloor={currentPlan.floorNumber} allRooms={allRooms} onConfirmCheckpoint={handleConfirmCheckpoint} />
      <GoogleMapsHandoffModal open={handoffOpen} onClose={() => setHandoffOpen(false)} targetDestination={endRoom} onSelectEntrance={handleSelectEntrance} />
      <CorrectionsAuditModal open={auditModalOpen} onClose={() => setAuditModalOpen(false)} activeFloor={currentPlan.floorNumber} allRooms={allRooms}
        onApplyOverride={(roomId, patch) => { const r = allRooms.find((x) => x.id === roomId); if (r) updateRoom({ ...r, ...patch }); }} />
      <E5ValidationModal open={validationModalOpen} onClose={() => setValidationModalOpen(false)} plans={buildingPlans} onApplyScenario={applyValidationScenario} />
      <UpdateMap
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        buildingName={currentPlan.buildingName || currentPlan.title}
        rooms={allRooms}
        initialRoom={lookupRoom}
        onSaveStaff={saveStaff}
        onSaveWeb={saveLookup}
        onReport={(r) => changeReports((l) => [r, ...l])}
        onFloorPlan={(img) => handleAddNewFloorPlan(img)}
        onShowRoom={(r) => { setLookupOpen(false); const fresh = plansRef.current.flatMap((p) => p.rooms.map((x) => ({ ...x, floor: x.floor ?? p.floorNumber }))).find((x) => x.id === r.id) || r; setInspected(fresh); showRoom(fresh); }}
      />
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      <OnboardingRoleModal
        open={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        currentRole={staffRole}
        onSelectRole={handleSelectRole}
      />
      <WorkplaceCompanionModal
        open={workplaceCompanionOpen}
        onClose={() => setWorkplaceCompanionOpen(false)}
        role={staffRole}
        onChangeRole={() => { setWorkplaceCompanionOpen(false); setRoleModalOpen(true); }}
        completedTasks={completedTasks}
        onToggleTask={toggleTask}
        onNavigateToRoom={(roomId, floor) => {
          const r = allRooms.find((x) => x.id === roomId || (x.roomNumber && roomId.includes(x.roomNumber)));
          if (r) {
            if (r.floor) goFloor(r.floor);
            directionsTo(r);
            showRoom(r);
          }
        }}
        onStartDay1Tour={() => startDay1Tour()}
        onOpenReportModal={(roomId, cat) => {
          setIssueRoomId(roomId || null);
          setIssueCategory(cat);
          setWorkplaceIssueOpen(true);
        }}
        onToggleSafetyOverlay={() => setSafetyOverlayActive((v) => !v)}
        safetyOverlayActive={safetyOverlayActive}
      />
      <WorkplaceIssueModal
        open={workplaceIssueOpen}
        onClose={() => setWorkplaceIssueOpen(false)}
        rooms={allRooms}
        initialRoomId={issueRoomId}
        initialCategory={issueCategory}
        onSubmitReport={(r) => changeReports((l) => [r, ...l])}
      />
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

  const openIndoor = (appBuildingId: string, floor: number, room?: RoomPOI) => {
    const p = plansRef.current.find((x) => x.buildingId === appBuildingId && x.floorNumber === (room?.floor ?? floor));
    if (p) setCurrentPlan(p);
    setView('indoor');
    if (room) { setInspected(room); setTimeout(() => showRoom(room), 120); }
  };
  if (view === 'campus') {
    return <CampusView plans={plans} imports={floorImports} onImportsChanged={loadImports} route={route} destination={endRoom} isMobile={isMobile} onOpenIndoor={openIndoor}
      onRouteIndoor={(appBuildingId, s, e, stepFree) => {
        setIsAccessibleOnly(stepFree);
        const p = plansRef.current.find((x) => x.buildingId === appBuildingId && x.floorNumber === s.floor);
        if (p) setCurrentPlan(p);
        setStartRoom(s); manualLocation(s); setEndRoom(e); setInspected(null); setView('indoor');
      }} />;
  }
  const campusButton = (
    <button onClick={() => setView('campus')} title="Back to campus map" aria-label="Back to campus map"
      className="h-8 px-2.5 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 shrink-0">
      <MapIcon className="w-3.5 h-3.5" /> <span>Campus</span>
    </button>
  );

  /* ======================= DESKTOP ======================= */
  if (!isMobile) {
    return (
      <div className="h-[100dvh] w-screen flex flex-col bg-white text-slate-900 font-sans antialiased overflow-hidden">
        <header className="h-14 shrink-0 border-b border-slate-200 flex items-center gap-3 px-4 bg-white z-10">
          <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center font-extrabold text-xs text-slate-900 shadow-sm">
            UW
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-tight leading-none text-slate-900">
              Waterloo StaffNav <span className="text-amber-600 font-bold">{buildingCode(currentPlan)}</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Workplace Companion & Navigation</span>
          </div>
          <span className="text-slate-300">|</span>
          {campusButton}

          {/* Role Indicator & Switcher Button */}
          <button
            onClick={() => setRoleModalOpen(true)}
            className="h-8 px-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Change your workplace role"
          >
            {staffRole === 'instructor' ? (
              <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
            ) : staffRole === 'contract' ? (
              <Wrench className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Briefcase className="w-3.5 h-3.5 text-blue-600" />
            )}
            <span>{STAFF_ROLES[staffRole]?.label || 'Sessional Instructor'}</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </button>

          {/* Quick Checklist Button */}
          <button
            onClick={() => setWorkplaceCompanionOpen(true)}
            className="h-8 px-3 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1.5 border border-amber-200 transition-colors"
            title="View Onboarding Checklist & Guides"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
            <span>Checklist ({completedTasks.length}/{ONBOARDING_TASKS.filter((t: OnboardingTask) => t.role === staffRole || t.role === 'all').length})</span>
          </button>

          <div className="flex-1" />
          {actions.map((a) => (
            <button key={a.label} onClick={a.on} title={a.label} aria-label={a.label}
              className={cx('h-9 px-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors', a.active ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100')}>
              <a.icon className="w-4 h-4" /> <span className="hidden xl:inline">{a.label}</span>
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
                placeholder={searchTarget === 'start' ? 'Search for a starting point' : 'Search rooms, podiums, lounges, uprint…'}
                autoFocus={searchTarget === 'start'}
                leading={searchTarget === 'start' ? <button onClick={() => { setSearchTarget('dest'); setSearchOpen(false); }}><ChevronLeft className="w-5 h-5 text-slate-500" /></button> : undefined}
                trailing={<MicButton size="sm" onFinalTranscript={(v) => { setQuery(v); setSearchOpen(true); }} />}
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
            <div className="absolute top-4 right-4"><FloorPicker floors={floors} labels={floorLabels} current={currentPlan.floorNumber} onPick={goFloor} routeFloors={routeFloors} vertical /></div>
            <div className="absolute bottom-4 right-4">{mapControls}</div>
            <div className="absolute top-4 left-4 pointer-events-none">
              <div className="bg-white/90 backdrop-blur rounded-xl px-3 py-1.5 shadow ring-1 ring-slate-200 text-sm">
                <span className="font-bold">Floor {currentPlan.floorLabel ?? currentPlan.floorNumber}</span>
                {currentPlan.subTitle && <span className="text-slate-500"> · {currentPlan.subTitle}</span>}
              </div>
            </div>

            {/* Day 1 Orientation Route Banner on Map */}
            {day1TourIndex !== null && activeTourStops[day1TourIndex] && !isNavigating && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[min(640px,calc(100%-180px))] bg-slate-900 text-white rounded-2xl p-4 shadow-xl border border-slate-700 animate-in fade-in slide-in-from-top-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-amber-400 text-slate-900 flex items-center justify-center font-black text-xs">
                      {day1TourIndex + 1}
                    </span>
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Day 1 Tour · Stop {day1TourIndex + 1} of {activeTourStops.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setDay1TourIndex(null)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-slate-800 transition-colors"
                  >
                    Exit Tour
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-white text-base leading-snug">
                      {activeTourStops[day1TourIndex].title}
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5 truncate">
                      {activeTourStops[day1TourIndex].whyVisit}
                    </p>
                    <p className="text-[11px] text-amber-200/90 mt-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 shrink-0 text-amber-400" />
                      <span>{activeTourStops[day1TourIndex].checkHint}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => advanceTour(day1TourIndex - 1)}
                      disabled={day1TourIndex === 0}
                      className="h-8 px-2.5 rounded-lg bg-slate-800 disabled:opacity-30 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                    >
                      Prev
                    </button>
                    {route && !isNavigating && (
                      <button
                        onClick={startNavigation}
                        className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <Navigation2 className="w-3.5 h-3.5 fill-current" />
                        <span>Walk</span>
                      </button>
                    )}
                    <button
                      onClick={() => advanceTour(day1TourIndex + 1)}
                      className="h-8 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                    >
                      <span>{day1TourIndex >= activeTourStops.length - 1 ? 'Finish' : 'Next'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
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
            {(isEditingMode || isOffline) && <div className="absolute top-16 left-4 right-24 flex flex-col gap-2">{editBanner}{offlineBanner}</div>}
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
                trailing={<MicButton size="sm" onFinalTranscript={(v) => { setQuery(v); setSearchOpen(true); setSheetFull(true); }} />}
              />
            </div>
            {!searchOpen && (
              <div className="pointer-events-auto flex items-center gap-2">
                {campusButton}
                <FloorPicker floors={floors} labels={floorLabels} current={currentPlan.floorNumber} onPick={goFloor} routeFloors={routeFloors} />
                <button
                  onClick={() => setWorkplaceCompanionOpen(true)}
                  className="h-10 px-3 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 flex items-center gap-1.5 text-xs font-bold text-slate-800 shrink-0"
                >
                  {staffRole === 'instructor' ? (
                    <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
                  ) : staffRole === 'contract' ? (
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  <span className="truncate max-w-[110px]">{STAFF_ROLES[staffRole]?.label || 'Staff'}</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900">
                    {completedTasks.length}
                  </span>
                </button>
              </div>
            )}
            {/* Day 1 Orientation banner on mobile */}
            {day1TourIndex !== null && activeTourStops[day1TourIndex] && !isNavigating && (
              <div className="pointer-events-auto bg-slate-900 text-white rounded-2xl p-3 shadow-xl border border-slate-700 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-amber-300">
                    Day 1 Tour: Stop {day1TourIndex + 1}/{activeTourStops.length}
                  </span>
                  <button onClick={() => setDay1TourIndex(null)} className="text-slate-400 hover:text-white">Exit</button>
                </div>
                <p className="font-extrabold text-sm truncate">{activeTourStops[day1TourIndex].title}</p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-[11px] text-slate-300 truncate">{activeTourStops[day1TourIndex].name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {route && !isNavigating && (
                      <button onClick={startNavigation} className="h-7 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Walk</button>
                    )}
                    <button onClick={() => advanceTour(day1TourIndex + 1)} className="h-7 px-3 rounded-lg bg-amber-400 text-slate-900 text-xs font-bold">
                      {day1TourIndex >= activeTourStops.length - 1 ? 'Finish' : 'Next'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {(editBanner || offlineBanner) && <div className="pointer-events-auto flex flex-col gap-2">{editBanner}{offlineBanner}</div>}
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
              <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center font-black text-xs text-slate-900">UW</div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-slate-900">Waterloo StaffNav E5</p>
                <p className="text-xs text-slate-500 truncate">{STAFF_ROLES[staffRole]?.label || 'Staff'} · {currentPlan.buildingName || currentPlan.title}</p>
              </div>
              <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            {buildingSelect}

            {/* Quick role switcher inside menu */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2">
                {staffRole === 'instructor' ? (
                  <GraduationCap className="w-5 h-5 text-amber-600" />
                ) : staffRole === 'contract' ? (
                  <Wrench className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Briefcase className="w-5 h-5 text-blue-600" />
                )}
                <div>
                  <p className="text-xs font-bold text-slate-900">{STAFF_ROLES[staffRole]?.label}</p>
                  <p className="text-[11px] text-slate-500">{completedTasks.length} checklist items completed</p>
                </div>
              </div>
              <button
                onClick={() => { setMenuOpen(false); setRoleModalOpen(true); }}
                className="text-xs font-bold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs"
              >
                Change Role
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {actions.map((a) => (
                <button key={a.label} onClick={() => { setMenuOpen(false); a.on(); }}
                  className={cx('h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-bold text-center px-1', a.active ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700')}>
                  <a.icon className="w-5 h-5" /> <span>{a.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setMenuOpen(false); setIsAccessibleOnly((v) => !v); }} className="w-full h-12 rounded-2xl bg-slate-100 flex items-center gap-2 px-4 text-xs font-bold text-slate-800">
              <Accessibility className="w-5 h-5" /> {isAccessibleOnly ? 'Routes use elevators only (Step-free)' : 'Routes may use stairs'}
            </button>
          </div>
        </div>
      )}
      {modals}
    </div>
  );
}

