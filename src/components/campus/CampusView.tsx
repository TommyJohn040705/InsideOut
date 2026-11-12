/**
 * Campus map: Google Maps (or the labelled MapLibre fallback) with Waterloo building
 * footprints, entrances and the georeferenced indoor floor of the selected building.
 * Every building goes through the same code: its floors come from its indoor "site"
 * (E5's traced drawings or a published floor-plan import), never from per-building UI.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Layers, DoorOpen, Lock, LocateFixed, Footprints, Accessibility, AlertTriangle, BarChart3, ChevronRight, FileText, Eye, Navigation2, ArrowUpDown, ExternalLink } from 'lucide-react';
import { FloorPlanData, NavigationRoute, RoomPOI } from '../../types/navigation';
import {
  BUILDINGS, CAMPUS_CENTER, COVERAGE_LABEL, GAP_LABEL, FLOOR_STATUS_LABEL, FOOTPRINTS, INDOOR, CampusBuilding, CampusFloor,
  buildingById, buildingLabel, coverageOf, coverageSummary, entrancesOf, searchBuildings,
  osmIndoorGeoJSON, osmLevelName, searchOsmRooms, OsmRoomHit,
} from '../../campus/campusData';
import type { LngLat } from '../../campus/georef';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID, MAP_PROVIDER } from '../../campus/map/config';
import type { CampusMapAdapter, FloorOverlay, MapMarker, MapProvider } from '../../campus/map/types';
import { FloorImport, importStatus } from '../../campus/floorImports';
import { indoorSites, planTrip, Trip, TripEnd } from '../../campus/tripPlanner';
import { loadOutdoorGraph } from '../../campus/outdoorRoute';
import { FloorPlanStudio } from './FloorPlanStudio';

interface Props {
  plans: FloorPlanData[];
  imports: FloorImport[];
  onImportsChanged: () => void;
  route: NavigationRoute | null;
  destination: RoomPOI | null;
  isMobile: boolean;
  onOpenIndoor: (appBuildingId: string, floor: number, room?: RoomPOI) => void;
  /** Hand a trip's indoor part to the indoor navigator. */
  onRouteIndoor: (appBuildingId: string, start: RoomPOI, end: RoomPOI, stepFree: boolean) => void;
}

type Hit = { kind: 'building'; b: CampusBuilding } | { kind: 'floor'; b: CampusBuilding; f: CampusFloor; mapped: number | null } | { kind: 'osmroom'; b: CampusBuilding; r: OsmRoomHit } | { kind: 'room'; b: CampusBuilding; room: RoomPOI; floor: number };

/** Basements first, then numbered floors, mezzanine/concourse, penthouse, roof. */
const floorOrder = (code: string) => {
  if (/^B(\d)$/i.test(code)) return -Number(code.slice(1));
  if (/^\d+$/.test(code)) return Number(code);
  return ({ MEZ: 1.5, CON: 1.4, PH: 90, RO: 99 } as Record<string, number>)[code.toUpperCase()] ?? 50;
};
const floorLabel = (code: string) => code.replace(/^0(\d)$/, '$1');

const hitLabel = (h: Hit) => h.kind === 'floor' ? `${h.b.code} floor ${h.f.wing ? h.f.wing + ' ' : ''}${floorLabel(h.f.floorCode)}` : h.kind === 'room' ? `${h.b.code} ${h.room.roomNumber || ''} ${h.room.name}`.trim() : h.kind === 'osmroom' ? `${h.b.code} ${[h.r.ref, h.r.name].filter(Boolean).join(': ')}` : buildingLabel(h.b);
const toTripEnd = (h: Hit): TripEnd => h.kind === 'room' ? { buildingId: h.b.id, room: h.room, label: hitLabel(h) } : h.kind === 'osmroom' ? { buildingId: h.b.id, at: h.r.center, label: hitLabel(h) } : { buildingId: h.b.id, label: hitLabel(h) };

export function CampusView({ plans, imports, onImportsChanged, route, destination, isMobile, onOpenIndoor, onRouteIndoor }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [adapter, setAdapter] = useState<CampusMapAdapter | null>(null);
  const [provider, setProvider] = useState<MapProvider>(MAP_PROVIDER);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(route ? 'E5' : null);
  const [floor, setFloor] = useState<number | null>(route?.toFloor ?? null);
  const [query, setQuery] = useState('');
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioPreview, setStudioPreview] = useState<FloorOverlay | null>(null);
  const [opacity, setOpacity] = useState(0.95);
  const [user, setUser] = useState<LngLat | null>(null);
  // OpenStreetMap indoor level being shown, and a room found by search on it.
  const [osmLevel, setOsmLevel] = useState<string | null>(null);
  const [osmRoom, setOsmRoom] = useState<OsmRoomHit | null>(null);
  const [walk, setWalk] = useState<string | null>(null);
  // Directions between any two campus places.
  const [tripOpen, setTripOpen] = useState(false);
  const [tripFrom, setTripFrom] = useState<TripEnd | null>(null);
  const [tripTo, setTripTo] = useState<TripEnd | null>(null);
  const [tripQ, setTripQ] = useState<{ which: 'from' | 'to'; q: string } | null>(null);
  const [stepFree, setStepFree] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripMsg, setTripMsg] = useState<string | null>(null);

  const sites = useMemo(() => indoorSites(plans, imports), [plans, imports]);
  const selected = selectedId ? buildingById(selectedId) : null;
  const site = selected ? sites[selected.id] || null : null;
  const entrances = useMemo(() => (selected ? entrancesOf(selected.id) : []), [selected]);
  /** Floors of the selected building that can be drawn on the map. */
  const siteFloors = useMemo(() => (site ? [...new Set(site.plans.map((p) => p.floorNumber))].filter((f) => site.georef(f)).sort((a, b) => a - b) : []), [site]);
  const chips = useMemo(() => {
    if (!selected) return [];
    const importFloor = (f: CampusFloor) => imports.find((x) => x.published && x.buildingId === selected.id && x.manifestFilename === f.filename)?.floorNumber;
    const out = selected.floors.map((f) => {
      const n = f.indoorFloor ?? importFloor(f) ?? (siteFloors.includes(floorOrder(f.floorCode)) ? floorOrder(f.floorCode) : undefined);
      return { key: f.id, code: f.floorCode, wing: f.wing || '', floor: n ?? null, restricted: f.restricted, url: f.url as string | null, filename: f.filename as string | null, title: `${f.filename}: ${f.restricted ? 'restricted document, ' : ''}${FLOOR_STATUS_LABEL[f.status]}` };
    });
    for (const n of siteFloors) if (!out.some((c) => c.floor === n)) out.push({ key: `site-${n}`, code: String(n), wing: '', floor: n, restricted: false, url: null, filename: null, title: 'Mapped floor (not in the Plant Operations list)' });
    return out.sort((a, b) => a.wing.localeCompare(b.wing) || floorOrder(a.code) - floorOrder(b.code));
  }, [selected, siteFloors, imports]);

  // Create the map once. If Google fails to load, say so and use the fallback.
  useEffect(() => {
    let live = true, made: CampusMapAdapter | null = null;
    const start = selectedId ? buildingById(selectedId)?.center || CAMPUS_CENTER : CAMPUS_CENTER;
    const fallback = async () => (await import('../../campus/map/maplibreAdapter')).createMapLibreAdapter(el.current!, start, selectedId ? 18 : 15.3);
    (async () => {
      try {
        if (MAP_PROVIDER === 'google') {
          try {
            made = await (await import('../../campus/map/googleAdapter')).createGoogleAdapter(el.current!, start, selectedId ? 19 : 16, GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID);
          } catch (e: any) {
            setMapError(`Google Maps did not load: ${e?.message || e}. Showing the development fallback map instead.`);
            el.current!.innerHTML = '';
            made = await fallback();
          }
        } else made = await fallback();
        if (!live) { made.destroy(); return; }
        setProvider(made.provider);
        made.setFootprints(FOOTPRINTS, (id) => { setSelectedId(id); setFloor(null); setWalk(null); });
        setAdapter(made);
      } catch (e: any) { if (live) setMapError(`The map could not load: ${e?.message || e}`); }
    })();
    return () => { live = false; setAdapter(null); made?.destroy(); };
  }, []);

  // Selection: highlight, fly, default floor.
  useEffect(() => {
    if (!adapter) return;
    adapter.setSelected(selectedId);
    adapter.clearWalkingRoute();
    const b = selectedId ? buildingById(selectedId) : null;
    const s = b ? sites[b.id] : null;
    if (b?.center) adapter.flyTo(b.center, s ? (provider === 'google' ? 19 : 17.8) : provider === 'google' ? 18 : 17, isMobile ? 300 : 0);
    if (s && floor == null) {
      const fl = [...new Set(s.plans.map((p) => p.floorNumber))].filter((f) => s.georef(f)).sort((x, y) => x - y);
      const want = route?.toFloor ?? destination?.floor ?? 2;
      setFloor(fl.includes(want) ? want : fl[0] ?? null);
    }
    // Buildings without our own indoor dataset fall back to what OpenStreetMap has surveyed.
    const lv = b && !s ? b.osmIndoor : [];
    setOsmLevel((cur) => (lv.some((l) => l.level === cur) ? cur : (lv.find((l) => l.rooms > 0) || lv[0])?.level ?? null));
  }, [adapter, selectedId]);

  useEffect(() => { adapter?.setFloorOpacity(opacity); }, [adapter, opacity]);

  // Georeferenced floor image + route + markers.
  useEffect(() => {
    if (!adapter) return;
    const plan = site && floor != null ? site.plans.find((p) => p.floorNumber === floor) : null;
    const g = site && floor != null ? site.georef(floor) : null;
    adapter.setFloorOverlay(studioPreview ?? (plan && g ? { url: plan.imageUrl, imageSize: g.source.imageSize, corners: g.corners } : null));
    // The indoor route belongs to this building only if its destination is one of its rooms.
    const routeHere = !!(route && destination && site?.plans.some((p) => p.rooms.some((r) => r.id === destination.id)));
    const seg = g && routeHere ? route!.floorSegments.find((s) => s.floor === floor) : null;
    adapter.setRoute(trip ? trip.line : seg && g ? seg.waypoints.map((p) => g.pctToLngLat(p)) : null);
    const markers: MapMarker[] = entrances.map((e) => ({
      id: e.id, lngLat: e.position, label: e.name || `${e.kind} entrance`, kind: e.wheelchair === 'yes' ? 'entrance_accessible' : 'entrance',
    }));
    if (g && routeHere && destination && (destination.floor ?? floor) === floor) markers.push({ id: 'dest', lngLat: g.pctToLngLat(destination.coords), label: destination.roomNumber || destination.name, kind: 'destination' });
    adapter.setIndoorVector(selected && osmLevel != null && !site ? osmIndoorGeoJSON(selected.id, osmLevel) : null);
    if (osmRoom && selected?.id === osmRoom.building.id && osmRoom.level === osmLevel) markers.push({ id: 'osmroom', lngLat: osmRoom.center, label: osmRoom.ref || osmRoom.name || 'Room', kind: 'destination' });
    if (user) markers.push({ id: 'user', lngLat: user, label: 'You (GPS)', kind: 'user' });
    adapter.setMarkers(markers);
  }, [adapter, site, floor, route, destination, entrances, user, selected, osmLevel, osmRoom, studioPreview, trip]);

  const search = (q0: string): Hit[] => {
    const q = q0.trim();
    if (!q) return [];
    const out: Hit[] = searchBuildings(q, 6).map((b) => ({ kind: 'building', b }));
    // "E5 3101" or "3101": rooms of every building with an indoor dataset (traced or imported).
    const m = q.match(/^([a-z]+\d*)?\s*(\d{3,4}[a-z]?)$/i);
    if (m) for (const s of Object.values(sites)) {
      const b = buildingById(s.buildingId);
      if (!b || (m[1] && m[1].toUpperCase() !== (b.code || b.id).toUpperCase())) continue;
      for (const p of s.plans) for (const r of p.rooms) {
        if (r.roomNumber?.toUpperCase().startsWith(m[2].toUpperCase())) out.unshift({ kind: 'room', b, room: { ...r, floor: r.floor ?? p.floorNumber }, floor: r.floor ?? p.floorNumber });
      }
    }
    // OpenStreetMap rooms only for buildings without their own indoor map.
    for (const r of searchOsmRooms(q, 5)) if (!sites[r.building.id]) out.unshift({ kind: 'osmroom', b: r.building, r });
    // "DC 2", "MC B1", "REV EH 3", "E5 floor 4": a floor from the Plant Operations catalogue.
    const fm = q.match(/^([a-z][a-z0-9_]*)\s+(?:floor\s+)?(?:([a-z]{2})\s+)?(b\d|\d{1,2}|mez|con|ph|ro)$/i);
    const fb = fm && BUILDINGS.find((x) => (x.code || '').toUpperCase() === fm[1].toUpperCase() && x.footprint);
    if (fm && fb) {
      const code = /^\d$/.test(fm[3]) ? `0${fm[3]}` : fm[3].toUpperCase();
      const s = sites[fb.id];
      for (const fl of fb.floors) if (fl.floorCode === code && (!fm[2] || fl.wing === fm[2].toUpperCase())) {
        const n = fl.indoorFloor ?? imports.find((x) => x.published && x.buildingId === fb.id && x.manifestFilename === fl.filename)?.floorNumber ?? null;
        out.unshift({ kind: 'floor', b: fb, f: fl, mapped: s && n != null && s.georef(n) ? n : null });
      }
    }
    return out.slice(0, 8);
  };
  const hits = useMemo(() => search(query), [query, sites]);
  const tripHits = useMemo(() => (tripQ ? search(tripQ.q) : []), [tripQ, sites]);

  const pick = (h: Hit) => {
    setQuery('');
    if (h.kind === 'room') onOpenIndoor(sites[h.b.id].appBuildingId, h.floor, h.room);
    else if (h.kind === 'floor') { setSelectedId(h.b.id); setFloor(h.mapped); setWalk(h.mapped == null ? `${hitLabel(h)} (${h.f.filename}) is listed by Plant Operations but not mapped yet${h.f.restricted ? '; it is a restricted document' : ''}.` : null); }
    else if (h.kind === 'osmroom') { setSelectedId(h.b.id); setFloor(null); setWalk(null); setOsmLevel(h.r.level); setOsmRoom(h.r); }
    else { setSelectedId(h.b.id); setFloor(null); setWalk(null); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setWalk('This browser has no location support.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const at: LngLat = [p.coords.longitude, p.coords.latitude]; setUser(at); adapter?.flyTo(at, 17); },
      () => setWalk('Location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const runTrip = async (from: TripEnd | null, to: TripEnd | null, sf: boolean) => {
    setTrip(null); setTripMsg(null);
    if (!from || !to) return;
    setTripMsg('Finding a route…');
    const g = await loadOutdoorGraph();
    const t = planTrip(g, sites, from, to, sf);
    if ('error' in t) { setTripMsg(t.error); return; }
    setTrip(t); setTripMsg(null);
    const dest = to.buildingId ? buildingById(to.buildingId) : null;
    if (dest) { setSelectedId(dest.id); const last = t.legs[t.legs.length - 1]; if (last.kind === 'indoor' && last.door) setFloor(last.door.room.floor ?? null); }
  };
  useEffect(() => { if (tripOpen) runTrip(tripFrom, tripTo, stepFree); }, [tripFrom, tripTo, stepFree, sites]);

  const openTripTo = (to: TripEnd) => {
    setTripOpen(true); setTripTo(to);
    if (!tripFrom && user) setTripFrom({ at: user, label: 'My location (GPS)' });
  };

  // Google's walking directions remain available as a second opinion when a key is set.
  const walkTo = async () => {
    if (!adapter || !selected?.center) return;
    if (provider !== 'google') { setWalk('Google walking directions need the Google Maps key; use Directions for the campus path network.'); return; }
    if (!user) { setWalk('Tap the location button first so directions have a starting point.'); return; }
    const door = entrances.find((e) => e.kind === 'main') || entrances[0];
    try {
      const r = await adapter.walkingRoute(user, door ? door.position : selected.center);
      setWalk(r ? `Google: ${Math.round(r.distanceM)} m, about ${Math.max(1, Math.round(r.durationS / 60))} min walk to ${door ? 'the entrance mapped in OpenStreetMap' : 'the building centre (no entrance mapped)'}.` : 'Google returned no walking route.');
    } catch (e: any) { setWalk(`Directions failed: ${e?.message || e}`); }
  };

  const sum = useMemo(coverageSummary, []);
  const importsOf = (id: string) => imports.filter((f) => f.buildingId === id);
  const card = selected && (
    <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-4 space-y-3 max-h-[60dvh] overflow-y-auto">
      <div className="flex items-start gap-3">
        <div className="min-w-10 h-10 px-2 rounded-xl bg-amber-400 flex items-center justify-center font-extrabold text-xs text-slate-900">{selected.code || 'UW'}</div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-slate-900 leading-tight">{selected.name || selected.code}</div>
          <div className="text-[11px] text-slate-500 font-medium">{site && !INDOOR[selected.id] ? 'Indoor map from an imported floor plan' : COVERAGE_LABEL[coverageOf(selected)]}</div>
        </div>
        <button aria-label="Close building card" onClick={() => { setSelectedId(null); setFloor(null); setWalk(null); }} className="p-1 text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
      </div>

      {chips.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Floors ({siteFloors.length} mapped, {selected.floors.length} plans listed)</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Floor selector">
            {chips.map((c) => c.floor != null ? (
              <button key={c.key} onClick={() => setFloor(c.floor)} title={c.title} aria-pressed={floor === c.floor}
                className={`h-8 min-w-8 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${floor === c.floor ? 'bg-slate-900 text-white' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'}`}>
                {c.restricted && <Lock className="w-3 h-3" />}{c.wing && <span className="opacity-60">{c.wing}</span>}{floorLabel(c.code)}
              </button>
            ) : (
              // Not on the map yet: the button opens the Plant Operations PDF (UW login; restricted ones need permission).
              <a key={c.key} href={c.url || undefined} target="_blank" rel="noreferrer" title={`Open ${c.filename} at Plant Operations (UW login${c.restricted ? '; restricted: needs permission' : ''})`}
                className="h-8 min-w-8 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 bg-slate-100 text-slate-600 hover:bg-slate-200 ring-1 ring-dashed ring-slate-300">
                {c.restricted && <Lock className="w-3 h-3" />}{c.wing && <span className="opacity-60">{c.wing}</span>}{floorLabel(c.code)}<ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            ))}
          </div>
          {(() => { const cur = chips.find((c) => c.floor != null && c.floor === floor && c.url); return cur ? <a href={cur.url!} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700"><ExternalLink className="w-3 h-3" /> Original PDF of this floor ({cur.filename}, UW login)</a> : null; })()}
          {selected.floors.some((f) => f.drawingSet) && <p className="text-[11px] text-slate-500 mt-1.5">Plant Operations draws this building on a shared sheet ({[...new Set(selected.floors.map((f) => f.drawingSet).filter(Boolean))].join(', ')}) that also covers {[...new Set(selected.floors.flatMap((f) => f.sharedWith || []))].join(', ')}.</p>}
          {!siteFloors.length && <p className="text-[11px] text-slate-500 mt-1.5">Grey floors are not on the map yet: tap one to open its Plant Operations PDF (sign in with your UW account). To put it on the map, import it under Floor plans.</p>}
        </div>
      )}

      {selected.gap && <p className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2"><b>No indoor map:</b> {selected.gap.note}</p>}

      {!site && selected.osmIndoor.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Surveyed in OpenStreetMap</div>
          <div className="flex flex-wrap gap-1.5">
            {selected.osmIndoor.map((l) => (
              <button key={l.level} onClick={() => setOsmLevel(l.level)} title={`${l.rooms} rooms, ${l.paths} corridors or links`}
                className={`h-8 px-2.5 rounded-lg text-xs font-bold ${osmLevel === l.level ? 'bg-slate-900 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'}`}>
                {osmLevelName(l)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Rooms and corridors drawn by OpenStreetMap volunteers. Unreviewed and incomplete; no indoor routing here.</p>
        </div>
      )}

      {site && (
        <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2 flex gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Alignment: {site.alignment}. Not surveyed or walked.</span>
        </p>
      )}
      {(site || studioPreview) && (
        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
          <Eye className="w-4 h-4" /> Inspect
          <input type="range" min={0.15} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="flex-1" aria-label="Floor plan opacity (compare with the footprint)" />
        </label>
      )}

      <div className="text-xs text-slate-600 flex items-center gap-1.5">
        <DoorOpen className="w-4 h-4 text-slate-500" />
        {entrances.length ? (
          <span>{entrances.length} entrance{entrances.length > 1 ? 's' : ''} mapped in OpenStreetMap
            {entrances.some((e) => e.wheelchair === 'yes') && <> , <Accessibility className="inline w-3.5 h-3.5 text-emerald-600" /> {entrances.filter((e) => e.wheelchair === 'yes').length} tagged wheelchair-accessible</>} (unverified)</span>
        ) : <span>No entrances mapped yet</span>}
      </div>

      <div className="flex gap-2">
        {site && (
          <button onClick={() => onOpenIndoor(site.appBuildingId, floor ?? siteFloors[0])} className="flex-1 h-10 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-slate-800">
            Indoor navigator <ChevronRight className="w-4 h-4" />
          </button>
        )}
        <button onClick={() => openTripTo({ buildingId: selected.id, label: buildingLabel(selected) })} className="flex-1 h-10 rounded-xl bg-amber-400 text-slate-900 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-amber-300">
          <Navigation2 className="w-4 h-4" /> Directions
        </button>
      </div>
      <div className="flex gap-3 text-xs font-semibold">
        <button onClick={() => setStudioOpen(true)} className="text-indigo-700 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Import a floor plan</button>
        {provider === 'google' && <button onClick={walkTo} className="text-slate-600 flex items-center gap-1"><Footprints className="w-3.5 h-3.5" /> Google walking route</button>}
      </div>
      {walk && <p className="text-xs text-slate-700" role="status">{walk}</p>}
    </div>
  );

  const endButton = (which: 'from' | 'to', v: TripEnd | null) => (
    tripQ?.which === which ? (
      <div className="relative">
        <input autoFocus value={tripQ.q} onChange={(e) => setTripQ({ which, q: e.target.value })} placeholder={which === 'from' ? 'From: building or room (DC, E5 2108)' : 'To: building or room (E5 3101)'}
          aria-label={which === 'from' ? 'Trip start' : 'Trip destination'} className="w-full h-10 px-3 rounded-xl bg-slate-100 text-sm outline-none ring-2 ring-blue-500" />
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl ring-1 ring-slate-200 overflow-hidden divide-y divide-slate-100">
          {which === 'from' && user && <li><button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { setTripFrom({ at: user, label: 'My location (GPS)' }); setTripQ(null); }}>My location (GPS)</button></li>}
          {tripHits.map((h, i) => <li key={i}><button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { (which === 'from' ? setTripFrom : setTripTo)(toTripEnd(h)); setTripQ(null); }}>{hitLabel(h)}</button></li>)}
        </ul>
      </div>
    ) : (
      <button onClick={() => setTripQ({ which, q: '' })} className="w-full h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-left text-sm truncate">
        {v ? v.label : <span className="text-slate-400">{which === 'from' ? 'Choose start' : 'Choose destination'}</span>}
      </button>
    )
  );

  const tripPanel = tripOpen && (
    <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-4 space-y-3 max-h-[60dvh] overflow-y-auto" role="region" aria-label="Campus directions">
      <div className="flex items-center gap-2">
        <Navigation2 className="w-5 h-5 text-blue-600" /><div className="font-extrabold flex-1">Directions</div>
        <button aria-label="Close directions" onClick={() => { setTripOpen(false); setTrip(null); setTripMsg(null); }} className="p-1 text-slate-500"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex gap-2 items-center">
        <div className="flex-1 space-y-2">{endButton('from', tripFrom)}{endButton('to', tripTo)}</div>
        <button aria-label="Swap start and destination" onClick={() => { setTripFrom(tripTo); setTripTo(tripFrom); }} className="w-9 h-9 rounded-full ring-1 ring-slate-200 flex items-center justify-center"><ArrowUpDown className="w-4 h-4" /></button>
      </div>
      <button onClick={() => setStepFree((v) => !v)} aria-pressed={stepFree} className={`w-full h-9 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 ring-1 ${stepFree ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : 'bg-white text-slate-700 ring-slate-200'}`}>
        <Accessibility className="w-4 h-4" /> {stepFree ? 'Step-free: no steps, elevators only' : 'Steps allowed'}
      </button>
      {tripMsg && <p role="status" className="text-xs text-slate-700 bg-slate-50 rounded-lg p-2">{tripMsg}</p>}
      {trip && (
        <div className="space-y-2">
          <div className="font-bold">{Math.round(trip.totalM)} m · about {Math.max(1, Math.round(trip.totalM / 70))} min</div>
          <ol className="space-y-1.5 text-sm">
            {trip.legs.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${l.kind === 'outdoor' ? 'bg-sky-600' : 'bg-indigo-600'}`}>{i + 1}</span>
                <span className="flex-1">
                  {l.kind === 'outdoor'
                    ? <>Walk {Math.round(l.route.distanceM)} m outside from {l.from} to {l.to}.</>
                    : <>Inside {l.buildingId}: {l.route.fromName} (floor {l.route.fromFloor}) to {l.route.toName} (floor {l.route.toFloor}), {Math.round(l.route.totalDistanceMeters)} m, {l.route.steps.length} steps.
                        {/* first leg leaves the start building (room -> door); a later leg enters the destination (door -> room) */}
                        <button className="ml-1 text-blue-700 font-semibold" onClick={() => onRouteIndoor(sites[l.buildingId].appBuildingId, i === 0 && l.door ? tripFrom!.room! : l.door ? l.door.room : tripFrom!.room!, i === 0 && l.door ? l.door.room : tripTo!.room!, stepFree)}>Open turn-by-turn</button></>}
                </span>
              </li>
            ))}
          </ol>
          <ul className="text-[11px] text-slate-500 list-disc pl-4 space-y-0.5">{trip.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[100dvh] w-screen relative bg-slate-100 text-slate-900 font-sans antialiased overflow-hidden">
      {/* The map library sets position:relative on its container, so size it with a wrapper. */}
      <div className="absolute inset-0"><div ref={el} className="w-full h-full" aria-label="University of Waterloo campus map" /></div>

      {/* search */}
      <div className="absolute top-0 left-0 right-0 p-3 pt-[max(12px,env(safe-area-inset-top))] pointer-events-none z-30">
        <div className="pointer-events-auto mx-auto md:mx-0 w-full md:w-[400px]">
          <div className="h-12 bg-white rounded-2xl shadow-md ring-1 ring-slate-200 flex items-center gap-2 px-3">
            <Search className="w-5 h-5 text-slate-500 shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buildings or rooms (E5 3101, DC, SLC)"
              aria-label="Search campus buildings and rooms" className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium placeholder:text-slate-400" />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X className="w-4 h-4 text-slate-500" /></button>}
          </div>
          {hits.length > 0 && (
            <ul className="mt-2 bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 overflow-hidden divide-y divide-slate-100">
              {hits.map((h) => (
                <li key={h.kind === 'floor' ? `${h.b.id}-${h.f.id}` : h.kind === 'room' ? h.room.id : h.kind === 'osmroom' ? `${h.b.id}-${h.r.level}-${h.r.ref}-${h.r.name}` : h.b.id} className="flex items-center">
                  <button onClick={() => pick(h)} className="flex-1 min-w-0 text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-2.5">
                    <span className="min-w-9 h-7 px-1.5 rounded-md bg-slate-100 text-[11px] font-extrabold flex items-center justify-center">{h.b.code || '·'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold truncate">{h.kind === 'room' ? `${h.b.code} ${h.room.roomNumber}: ${h.room.name}` : hitLabel(h)}</span>
                      <span className="block text-[11px] text-slate-500">{h.kind === 'floor' ? (h.mapped != null ? 'Mapped floor: shows it on the map' : `Floor plan ${h.f.filename}: not mapped yet`) : h.kind === 'room' ? `Floor ${h.floor}, opens the indoor navigator` : h.kind === 'osmroom' ? `${h.r.levelName}, from OpenStreetMap (unreviewed)` : COVERAGE_LABEL[coverageOf(h.b)]}</span>
                    </span>
                  </button>
                  <button aria-label={`Directions to ${hitLabel(h)}`} title="Directions" onClick={() => { setQuery(''); openTripTo(toTripEnd(h)); }} className="px-3 h-12 text-blue-700"><Navigation2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && hits.length === 0 && <div className="mt-2 bg-white rounded-2xl shadow ring-1 ring-slate-200 px-3 py-2.5 text-sm text-slate-600">No building or mapped room matches.</div>}
        </div>
      </div>

      {/* provider badge + controls */}
      <div className="absolute right-3 top-[76px] md:top-3 flex flex-col items-end gap-2">
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shadow ring-1 ${provider === 'google' ? 'bg-white text-slate-700 ring-slate-200' : 'bg-amber-100 text-amber-900 ring-amber-300'}`}>
          {provider === 'google' ? 'Google Maps' : 'Development fallback map (MapLibre, not Google Maps)'}
        </span>
        <button onClick={() => setCoverageOpen(true)} className="h-10 px-3 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 text-xs font-bold flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Coverage</button>
        <button onClick={() => setTripOpen(true)} className="h-10 px-3 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 text-xs font-bold flex items-center gap-1.5"><Navigation2 className="w-4 h-4" /> Directions</button>
        <button onClick={() => setStudioOpen(true)} className="h-10 px-3 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 text-xs font-bold flex items-center gap-1.5"><FileText className="w-4 h-4" /> Floor plans</button>
        <button onClick={locate} aria-label="Show my location" className="w-10 h-10 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 flex items-center justify-center"><LocateFixed className="w-5 h-5 text-slate-700" /></button>
      </div>

      {mapError && <div role="alert" className="absolute left-3 right-3 top-[76px] md:left-auto md:right-3 md:top-64 md:w-[360px] bg-red-50 text-red-900 ring-1 ring-red-200 rounded-xl p-3 text-xs font-medium">{mapError}</div>}

      {(tripPanel || card) && (
        <div className={isMobile ? 'absolute left-0 right-0 bottom-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))]' : 'absolute left-3 top-[76px] w-[400px] space-y-2'}>
          {tripPanel || card}
        </div>
      )}

      {studioOpen && (
        <div className={isMobile ? 'fixed inset-x-0 bottom-0 top-1/3 z-40 p-2' : 'absolute right-3 top-3 bottom-3 w-[420px] z-40'}>
          <FloorPlanStudio buildingId={selectedId} imports={imports} onChanged={onImportsChanged} adapter={adapter} onPreview={setStudioPreview} onClose={() => setStudioOpen(false)} />
        </div>
      )}

      {coverageOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end md:items-center justify-center" onClick={() => setCoverageOpen(false)}>
          <div role="dialog" aria-label="Campus mapping coverage" className="bg-white w-full md:w-[760px] max-h-[85dvh] rounded-t-2xl md:rounded-2xl p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-extrabold text-lg">Campus mapping coverage</h2>
              <button aria-label="Close coverage" onClick={() => setCoverageOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center mb-3">
              {[[sum.withFootprint, 'buildings on the map'], [sum.floorRefs, 'floor plans listed'], [sum.restrictedFloors, 'of those restricted'], [imports.length, 'floor plans imported'], [sum.georeferencedFloors + imports.filter((f) => f.published).length, 'floors on the map (draft)']].map(([n, l]) => (
                <div key={l as string} className="bg-slate-50 rounded-xl p-2"><div className="text-xl font-extrabold">{n}</div><div className="text-[11px] text-slate-600">{l}</div></div>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 mb-1">Gaps: {Object.entries(sum.gaps).map(([k, n]) => `${n} ${GAP_LABEL[k as keyof typeof GAP_LABEL].toLowerCase()}`).join(' · ')}.</p>
            <p className="text-[11px] text-slate-500 mb-2">A listed floor plan is a document reference, not a finished indoor map. {Object.keys(sites).length} of {sum.buildings} buildings have an indoor map; none has been physically route-verified.</p>
            <div className="overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500 sticky top-0 bg-white"><tr><th className="py-1">Building</th><th>Footprint</th><th>Plans</th><th>Restricted</th><th>Entrances</th><th>Indoor status</th></tr></thead>
                <tbody>
                  {BUILDINGS.filter((b) => b.code || b.name).map((b) => {
                    const im = importsOf(b.id);
                    return (
                      <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => { if (b.center) { setSelectedId(b.id); setFloor(null); setCoverageOpen(false); } }}>
                        <td className="py-1 font-bold">{b.code} <span className="font-normal text-slate-500">{b.name}</span></td>
                        <td>{b.footprint ? 'OSM' : 'none'}</td><td>{b.floors.length}</td><td>{b.floors.filter((f) => f.restricted).length}</td><td>{b.entrances.length}</td>
                        <td title={b.gap?.note}>{INDOOR[b.id] ? 'Georeferenced (draft), routing from traced drawings'
                          : im.length ? im.map((f) => `${f.floorCode}: ${FLOOR_STATUS_LABEL[importStatus(f)]}${f.published ? '' : ' (unpublished)'}`).join('; ')
                          : b.gap ? GAP_LABEL[b.gap.kind] : b.osmIndoor.some((l) => l.rooms > 0) ? 'OSM rooms only, no routing' : 'Plans listed, not imported'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
