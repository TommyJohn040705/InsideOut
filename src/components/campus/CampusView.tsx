/**
 * Campus map: Google Maps (or the labelled MapLibre fallback) with Waterloo building
 * footprints, entrances and the georeferenced indoor floor of the selected building.
 * Opening a building hands over to the existing indoor navigation without losing the route.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Layers, DoorOpen, Lock, LocateFixed, Footprints, Accessibility, AlertTriangle, BarChart3, ChevronRight } from 'lucide-react';
import { FloorPlanData, NavigationRoute, RoomPOI } from '../../types/navigation';
import {
  BUILDINGS, CAMPUS_CENTER, COVERAGE_LABEL, FLOOR_STATUS_LABEL, FOOTPRINTS, INDOOR, CampusBuilding,
  buildingById, buildingLabel, coverageOf, coverageSummary, entrancesOf, searchBuildings,
} from '../../campus/campusData';
import type { LngLat } from '../../campus/georef';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_MAP_ID, MAP_PROVIDER } from '../../campus/map/config';
import type { CampusMapAdapter, MapMarker, MapProvider } from '../../campus/map/types';

interface Props {
  plans: FloorPlanData[];
  route: NavigationRoute | null;
  destination: RoomPOI | null;
  isMobile: boolean;
  onOpenIndoor: (appBuildingId: string, floor: number, room?: RoomPOI) => void;
}

type Hit = { kind: 'building'; b: CampusBuilding } | { kind: 'room'; b: CampusBuilding; room: RoomPOI; floor: number };

export function CampusView({ plans, route, destination, isMobile, onOpenIndoor }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [adapter, setAdapter] = useState<CampusMapAdapter | null>(null);
  const [provider, setProvider] = useState<MapProvider>(MAP_PROVIDER);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(route ? 'E5' : null);
  const [floor, setFloor] = useState<number | null>(route?.toFloor ?? null);
  const [query, setQuery] = useState('');
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [user, setUser] = useState<LngLat | null>(null);
  const [walk, setWalk] = useState<string | null>(null);

  const selected = selectedId ? buildingById(selectedId) : null;
  const indoor = selected ? INDOOR[selected.id] : null;
  const indoorPlans = useMemo(() => (indoor ? plans.filter((p) => p.buildingId === indoor.appBuildingId) : []), [indoor, plans]);
  const entrances = useMemo(() => (selected ? entrancesOf(selected.id) : []), [selected]);

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
    if (b?.center) adapter.flyTo(b.center, INDOOR[b.id] ? (provider === 'google' ? 19 : 17.8) : provider === 'google' ? 18 : 17, isMobile ? 300 : 0);
    if (b && INDOOR[b.id] && floor == null) setFloor(route?.toFloor ?? destination?.floor ?? 2);
  }, [adapter, selectedId]);

  // Georeferenced floor image + indoor route + markers.
  useEffect(() => {
    if (!adapter) return;
    const plan = floor != null ? indoorPlans.find((p) => p.floorNumber === floor) : null;
    const g = indoor && floor != null && indoor.georef.source.floors.includes(floor) ? indoor.georef : null;
    adapter.setFloorOverlay(plan && g ? { url: plan.imageUrl, imageSize: g.source.imageSize, corners: g.corners } : null);
    const seg = g && route ? route.floorSegments.find((s) => s.floor === floor) : null;
    adapter.setRoute(seg && g ? seg.waypoints.map((p) => g.pctToLngLat(p)) : null);
    const markers: MapMarker[] = entrances.map((e) => ({
      id: e.id, lngLat: e.position, label: e.name || `${e.kind} entrance`, kind: e.wheelchair === 'yes' ? 'entrance_accessible' : 'entrance',
    }));
    if (g && destination && (destination.floor ?? floor) === floor) markers.push({ id: 'dest', lngLat: g.pctToLngLat(destination.coords), label: destination.roomNumber || destination.name, kind: 'destination' });
    if (user) markers.push({ id: 'user', lngLat: user, label: 'You (GPS)', kind: 'user' });
    adapter.setMarkers(markers);
  }, [adapter, indoor, indoorPlans, floor, route, destination, entrances, user]);

  const hits: Hit[] = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const out: Hit[] = searchBuildings(q, 6).map((b) => ({ kind: 'building', b }));
    // "E5 3101" or "3101": rooms of buildings that have an indoor dataset.
    const m = q.match(/^([a-z]+\d*)?\s*(\d{3,4}[a-z]?)$/i);
    if (m) for (const [id, d] of Object.entries(INDOOR)) {
      if (m[1] && m[1].toUpperCase() !== id) continue;
      const b = buildingById(id);
      if (!b) continue;
      for (const p of plans.filter((x) => x.buildingId === d.appBuildingId)) for (const r of p.rooms) {
        if (r.roomNumber?.toUpperCase().startsWith(m[2].toUpperCase())) out.unshift({ kind: 'room', b, room: { ...r, floor: r.floor ?? p.floorNumber }, floor: r.floor ?? p.floorNumber });
      }
    }
    return out.slice(0, 8);
  }, [query, plans]);

  const pick = (h: Hit) => {
    setQuery('');
    if (h.kind === 'room') onOpenIndoor(INDOOR[h.b.id].appBuildingId, h.floor, h.room);
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

  const walkTo = async () => {
    if (!adapter || !selected?.center) return;
    if (provider !== 'google') { setWalk('Outdoor walking directions need the Google Maps key. The fallback map has none.'); return; }
    if (!user) { setWalk('Tap the location button first so directions have a starting point.'); return; }
    const door = entrances.find((e) => e.kind === 'main') || entrances[0];
    try {
      const r = await adapter.walkingRoute(user, door ? door.position : selected.center);
      setWalk(r ? `${Math.round(r.distanceM)} m, about ${Math.max(1, Math.round(r.durationS / 60))} min walk to ${door ? 'the entrance mapped in OpenStreetMap' : 'the building centre (no entrance mapped)'}.` : 'Google returned no walking route.');
    } catch (e: any) { setWalk(`Directions failed: ${e?.message || e}`); }
  };

  const sum = useMemo(coverageSummary, []);
  const georef = indoor?.georef;
  const card = selected && (
    <div className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-4 space-y-3 max-h-[60dvh] overflow-y-auto">
      <div className="flex items-start gap-3">
        <div className="min-w-10 h-10 px-2 rounded-xl bg-amber-400 flex items-center justify-center font-extrabold text-xs text-slate-900">{selected.code || 'UW'}</div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-slate-900 leading-tight">{selected.name || selected.code}</div>
          <div className="text-[11px] text-slate-500 font-medium">{COVERAGE_LABEL[coverageOf(selected)]}</div>
        </div>
        <button aria-label="Close building card" onClick={() => { setSelectedId(null); setFloor(null); setWalk(null); }} className="p-1 text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
      </div>

      {selected.floors.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Floors ({selected.floors.length} plans listed)</div>
          <div className="flex flex-wrap gap-1.5">
            {selected.floors.map((f) => {
              const mapped = f.indoorFloor != null;
              return (
                <button key={f.id} disabled={!mapped} onClick={() => setFloor(f.indoorFloor!)}
                  title={`${f.filename}: ${f.restricted ? 'restricted document, ' : ''}${FLOOR_STATUS_LABEL[f.status]}`}
                  className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 ${mapped ? (floor === f.indoorFloor ? 'bg-slate-900 text-white' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100') : 'bg-slate-100 text-slate-400'}`}>
                  {f.restricted && <Lock className="w-3 h-3" />}{f.floorCode}
                </button>
              );
            })}
          </div>
          {!indoor && <p className="text-[11px] text-slate-500 mt-1.5">These are floor-plan documents listed by Plant Operations. They need a UW login to download, and none has been mapped yet.</p>}
        </div>
      )}

      {georef && (
        <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2 flex gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Draft alignment: floor plan fitted to the OpenStreetMap footprint ({georef.rmsM.toFixed(1)} m fit error). Not surveyed or walked.</span>
        </p>
      )}

      <div className="text-xs text-slate-600 flex items-center gap-1.5">
        <DoorOpen className="w-4 h-4 text-slate-500" />
        {entrances.length ? (
          <span>{entrances.length} entrance{entrances.length > 1 ? 's' : ''} mapped in OpenStreetMap
            {entrances.some((e) => e.wheelchair === 'yes') && <> , <Accessibility className="inline w-3.5 h-3.5 text-emerald-600" /> {entrances.filter((e) => e.wheelchair === 'yes').length} tagged wheelchair-accessible</>} (unverified)</span>
        ) : <span>No entrances mapped yet</span>}
      </div>

      <div className="flex gap-2">
        {indoor && (
          <button onClick={() => onOpenIndoor(indoor.appBuildingId, floor ?? 2)} className="flex-1 h-10 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-slate-800">
            Open indoor map <ChevronRight className="w-4 h-4" />
          </button>
        )}
        <button onClick={walkTo} className="flex-1 h-10 rounded-xl bg-amber-400 text-slate-900 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-amber-300">
          <Footprints className="w-4 h-4" /> Walk here
        </button>
      </div>
      {walk && <p className="text-xs text-slate-700" role="status">{walk}</p>}
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
                <li key={h.kind === 'room' ? h.room.id : h.b.id}>
                  <button onClick={() => pick(h)} className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-2.5">
                    <span className="min-w-9 h-7 px-1.5 rounded-md bg-slate-100 text-[11px] font-extrabold flex items-center justify-center">{h.b.code || '·'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold truncate">{h.kind === 'room' ? `${h.b.code} ${h.room.roomNumber}: ${h.room.name}` : buildingLabel(h.b)}</span>
                      <span className="block text-[11px] text-slate-500">{h.kind === 'room' ? `Floor ${h.floor}, opens indoor map` : COVERAGE_LABEL[coverageOf(h.b)]}</span>
                    </span>
                  </button>
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
        <button onClick={locate} aria-label="Show my location" className="w-10 h-10 rounded-2xl bg-white shadow-md ring-1 ring-slate-200 flex items-center justify-center"><LocateFixed className="w-5 h-5 text-slate-700" /></button>
      </div>

      {mapError && <div role="alert" className="absolute left-3 right-3 top-[76px] md:left-auto md:right-3 md:top-36 md:w-[360px] bg-red-50 text-red-900 ring-1 ring-red-200 rounded-xl p-3 text-xs font-medium">{mapError}</div>}

      {card && <div className={isMobile ? 'absolute left-0 right-0 bottom-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))]' : 'absolute left-3 top-[76px] w-[400px]'}>{card}</div>}

      {coverageOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end md:items-center justify-center" onClick={() => setCoverageOpen(false)}>
          <div role="dialog" aria-label="Campus mapping coverage" className="bg-white w-full md:w-[720px] max-h-[85dvh] rounded-t-2xl md:rounded-2xl p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-extrabold text-lg">Campus mapping coverage</h2>
              <button aria-label="Close coverage" onClick={() => setCoverageOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center mb-3">
              {[[sum.withFootprint, 'buildings on the map'], [sum.floorRefs, 'floor plans listed'], [sum.restrictedFloors, 'of those restricted'], [sum.georeferencedFloors, 'floors georeferenced (draft)']].map(([n, l]) => (
                <div key={l as string} className="bg-slate-50 rounded-xl p-2"><div className="text-xl font-extrabold">{n}</div><div className="text-[11px] text-slate-600">{l}</div></div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mb-2">A listed floor plan is a document reference, not a finished indoor map. {sum.indoorMapped} of {sum.buildings} buildings has an indoor map, and none has been physically route-verified.</p>
            <div className="overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500 sticky top-0 bg-white"><tr><th className="py-1">Building</th><th>Footprint</th><th>Plans</th><th>Restricted</th><th>Entrances</th><th>Indoor status</th></tr></thead>
                <tbody>
                  {BUILDINGS.filter((b) => b.code).map((b) => (
                    <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => { if (b.center) { setSelectedId(b.id); setFloor(null); setCoverageOpen(false); } }}>
                      <td className="py-1 font-bold">{b.code} <span className="font-normal text-slate-500">{b.name}</span></td>
                      <td>{b.footprint ? 'OSM' : 'none'}</td><td>{b.floors.length}</td><td>{b.floors.filter((f) => f.restricted).length}</td><td>{b.entrances.length}</td>
                      <td>{INDOOR[b.id] ? 'Georeferenced (draft), routing from traced drawings' : b.floors.length ? 'Source found' : 'Not sourced'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
