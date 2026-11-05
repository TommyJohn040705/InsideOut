import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapView } from './components/MapView';
import { PlacePicker } from './components/PlacePicker';
import { ReportsPanel } from './components/ReportsPanel';
import { EditorPanel, type EditorTool } from './components/EditorPanel';
import { ImportPanel } from './components/ImportPanel';
import { NavigationHUD } from './components/NavigationHUD';
import { AssistantPanel } from './components/AssistantPanel';
import { createDefaultBuildings } from './data/buildings';
import { createSampleBuilding } from './data/sampleBuilding';
import { findRoute } from './lib/routing';
import { answerLocally } from './lib/assistant';
import { activeReports, blockedEdgeIds, clearReport, confirmReport, createReport, loadReports, saveReports } from './lib/reports';
import {
  addFloor,
  addNode,
  clearSavedBuildings,
  connectNodes,
  deleteEdge,
  deleteFloor,
  deleteNode,
  loadActiveBuildingId,
  loadBuildings,
  moveNode,
  saveActiveBuildingId,
  saveBuildings,
  updateNode,
  validateBuilding,
} from './lib/editor';
import type { Building, MapEdge, MapNode, Report } from './lib/types';

type Mode = 'navigate' | 'ask' | 'report' | 'edit' | 'import';

const MODE_LABEL: Record<Mode, string> = { navigate: 'Navigate', ask: 'Ask', report: 'Report', edit: 'Edit map', import: 'Add floor' };
const QUICK = [
  { label: 'Washroom', q: 'nearest washroom' },
  { label: 'Food', q: 'nearest food' },
  { label: 'Elevator', q: 'nearest elevator' },
  { label: 'Exit', q: 'nearest exit' },
];

const lowestFloor = (b: Building) => [...b.floors].sort((a, c) => a.level - c.level)[0]?.id;

export default function App() {
  const [buildings, setBuildings] = useState<Building[]>(() => loadBuildings() ?? createDefaultBuildings());
  const [buildingId, setBuildingId] = useState<string>(() => {
    const saved = loadActiveBuildingId();
    return buildings.some((b) => b.id === saved) ? saved! : buildings[0].id;
  });
  const building = buildings.find((b) => b.id === buildingId) ?? buildings[0];
  const setBuilding = useCallback(
    (update: Building | ((b: Building) => Building)) =>
      setBuildings((all) => all.map((b) => (b.id === buildingId ? (typeof update === 'function' ? update(b) : update) : b))),
    [buildingId],
  );

  const [reports, setReports] = useState<Report[]>(() => loadReports());
  const [mode, setMode] = useState<Mode>('navigate');
  const [floorId, setFloorId] = useState(() => lowestFloor(building));
  const [fromId, setFromId] = useState<string | undefined>();
  const [toId, setToId] = useState<string | undefined>();
  const [accessible, setAccessible] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState<{ kind: Report['kind']; targetId: string; title: string } | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [tool, setTool] = useState<EditorTool>('select');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [connectFrom, setConnectFrom] = useState<string | undefined>();
  const [editMsg, setEditMsg] = useState<string | undefined>();
  const [navStep, setNavStep] = useState<number | null>(null);
  const [serverGemini, setServerGemini] = useState(false);

  useEffect(() => {
    if (!saveBuildings(buildings)) setToast('Browser storage is full; recent map edits will not survive a reload. Export JSON to keep them.');
  }, [buildings]);
  useEffect(() => saveActiveBuildingId(buildingId), [buildingId]);
  useEffect(() => saveReports(reports), [reports]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => setServerGemini(Boolean(h?.gemini)))
      .catch(() => setServerGemini(false));
  }, []);

  const floors = useMemo(() => [...building.floors].sort((a, b) => b.level - a.level), [building.floors]);
  const floor = building.floors.find((f) => f.id === floorId) ?? floors[floors.length - 1];
  const buildingReports = useMemo(() => reports.filter((r) => !r.buildingId || r.buildingId === building.id), [reports, building.id]);
  const live = useMemo(() => activeReports(buildingReports, now), [buildingReports, now]);
  const blocked = useMemo(() => blockedEdgeIds(building, live, now), [building, live, now]);
  const outShafts = useMemo(
    () => new Set(live.filter((r) => r.kind === 'elevator-out' || r.kind === 'stairs-closed').map((r) => r.targetId)),
    [live],
  );

  const result = useMemo(
    () => (fromId && toId ? findRoute(building, { fromId, toId, options: { accessible }, blockedEdges: blocked }) : null),
    [building, fromId, toId, accessible, blocked],
  );
  const route = result?.ok ? result.route : null;

  // Waze-style: tell the user when a report changed their active route.
  const lastRouteKey = useRef('');
  const lastBlockedSize = useRef(blocked.size);
  useEffect(() => {
    const key = route ? route.edgeIds.join('|') : result ? 'none' : '';
    if (lastRouteKey.current && key && key !== lastRouteKey.current && blocked.size !== lastBlockedSize.current) {
      setToast(route ? 'Route updated to avoid a reported issue.' : 'A new report blocks your route.');
      if (navStep !== null) setNavStep(0);
    }
    lastRouteKey.current = key;
    lastBlockedSize.current = blocked.size;
  }, [route, result, blocked, navStep]);

  // Keep the map on the floor of the current navigation step.
  // The walker stands where the previous step ended, about to do the current one.
  const stepNode = navStep !== null && route ? route.steps[Math.max(0, Math.min(navStep, route.steps.length - 1) - 1)] : undefined;
  useEffect(() => {
    if (stepNode) setFloorId(stepNode.floorId);
  }, [stepNode]);
  useEffect(() => {
    if (!route && navStep !== null) setNavStep(null);
  }, [route, navStep]);

  const switchBuilding = (id: string) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return;
    setBuildingId(id);
    setFloorId(lowestFloor(b));
    setFromId(undefined);
    setToId(undefined);
    setSelectedId(undefined);
    setConnectFrom(undefined);
    setNavStep(null);
  };

  const showNode = (nodeId?: string) => {
    const n = nodeId ? building.nodes.find((x) => x.id === nodeId) : undefined;
    if (n) setFloorId(n.floorId);
  };

  const routeTo = (nodeId: string) => {
    setToId(nodeId);
    setNavStep(null);
    setMode('navigate');
    if (fromId) showNode(fromId);
    else showNode(nodeId);
  };

  const quickRoute = (q: string) => {
    const a = answerLocally(building, q, fromId, { accessible, blockedEdges: blocked });
    if (a.destinationId) {
      setToId(a.destinationId);
      setNavStep(null);
      if (!fromId) setToast('Set a starting point to find the nearest one.');
    } else setToast(a.answer);
  };

  // ----- Map interaction per mode -----
  const onNodeClick = (n: MapNode) => {
    if (mode === 'navigate' || mode === 'ask') {
      if (n.kind === 'corridor' || navStep !== null) return;
      if (!fromId || (fromId && toId)) {
        setFromId(n.id);
        setToId(undefined);
      } else setToId(n.id);
      return;
    }
    if (mode === 'report') {
      if ((n.kind === 'elevator' || n.kind === 'stairs') && n.shaftId) {
        const short = n.label?.replace(/\s*\(.*\)$/, '');
        setReportDraft({
          kind: n.kind === 'elevator' ? 'elevator-out' : 'stairs-closed',
          targetId: n.shaftId,
          title: n.kind === 'elevator' ? `Report ${short} out of service` : `Report ${short} closed`,
        });
      }
      return;
    }
    if (mode === 'edit') {
      setEditMsg(undefined);
      if (tool === 'select') setSelectedId(n.id);
      else if (tool === 'delete') {
        setBuilding((b) => deleteNode(b, n.id));
        if (selectedId === n.id) setSelectedId(undefined);
      } else if (tool === 'connect') {
        if (!connectFrom) setConnectFrom(n.id);
        else {
          const res = connectNodes(building, connectFrom, n.id);
          if (res.error) setEditMsg(res.error);
          else setBuilding(res.building);
          setConnectFrom(undefined);
        }
      }
    }
  };

  const onEdgeClick = (e: MapEdge) => {
    if (mode === 'report') setReportDraft({ kind: 'blocked-corridor', targetId: e.id, title: 'Report this corridor blocked' });
    else if (mode === 'edit' && tool === 'delete') setBuilding((b) => deleteEdge(b, e.id));
  };

  const onBackgroundClick = (x: number, y: number) => {
    if (mode !== 'edit') return;
    if (tool === 'room' || tool === 'corridor' || tool === 'stairs' || tool === 'elevator' || tool === 'entrance') {
      const res = addNode(building, floor.id, tool, x, y);
      setBuilding(res.building);
      setSelectedId(res.node.id);
    } else if (tool === 'select') setSelectedId(undefined);
  };

  const submitReport = () => {
    if (!reportDraft) return;
    const existing = live.find((r) => r.kind === reportDraft.kind && r.targetId === reportDraft.targetId);
    if (existing) setReports((rs) => rs.map((r) => (r.id === existing.id ? confirmReport(r) : r)));
    else setReports((rs) => [...rs, createReport(reportDraft.kind, reportDraft.targetId, reportNote, Date.now(), building.id)]);
    setReportDraft(null);
    setReportNote('');
    setNow(Date.now());
  };

  const selected = selectedId ? building.nodes.find((n) => n.id === selectedId) : undefined;
  const pending = connectFrom ? building.nodes.find((n) => n.id === connectFrom) : undefined;
  const floorName = (id: string) => building.floors.find((f) => f.id === id)?.name ?? id;
  const routeFloors = route ? [...new Set(route.nodeIds.map((id) => building.nodes.find((n) => n.id === id)!.floorId))] : [];
  const navigating = navStep !== null && !!route;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(building, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${building.name.replace(/\W+/g, '-').toLowerCase() || 'building'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!validateBuilding(parsed)) throw new Error('invalid');
      const id = buildings.some((b) => b.id === parsed.id) ? `${parsed.id}-${Date.now().toString(36)}` : parsed.id || `b-${Date.now().toString(36)}`;
      setBuildings((all) => [...all, { ...parsed, id }]);
      setBuildingId(id);
      setFloorId(lowestFloor(parsed));
      setFromId(undefined);
      setToId(undefined);
      setEditMsg(undefined);
    } catch {
      setEditMsg('That file is not a valid InsideOut building.');
    }
  };

  return (
    <div className={`app mode-${mode}${navigating ? ' navigating' : ''}`}>
      <header>
        <div className="brand">
          <span className="logo" aria-hidden="true">IO</span>
          <div>
            <h1>InsideOut</h1>
            <select className="building-select" value={building.id} onChange={(e) => switchBuilding(e.target.value)} aria-label="Building">
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <nav className="modes" aria-label="Mode">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? 'active' : ''}
              onClick={() => {
                setMode(m);
                setConnectFrom(undefined);
                setEditMsg(undefined);
                setReportDraft(null);
                if (m === 'edit' || m === 'import') setNavStep(null);
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <aside>
          {(mode === 'navigate' || mode === 'report') && (
            <section className="panel">
              <h2>Directions</h2>
              {building.description && <p className="muted desc">{building.description}</p>}
              <PlacePicker building={building} label="From" placeholder="Search a start, e.g. Main Entrance" value={fromId} onChange={(id) => (setFromId(id), showNode(id))} />
              <PlacePicker building={building} label="To" placeholder="Search a room, e.g. 205 or Library" value={toId} onChange={setToId} />
              <div className="chips" aria-label="Quick destinations">
                {QUICK.map((c) => (
                  <button key={c.label} className="chip-btn" onClick={() => quickRoute(c.q)}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="row">
                <label className="toggle">
                  <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} />
                  Wheelchair accessible (no stairs)
                </label>
                {fromId && toId && (
                  <button className="link" onClick={() => (setFromId(toId), setToId(fromId))}>
                    Swap
                  </button>
                )}
              </div>
              {!fromId && <p className="hint">Search above, or tap a room on the map to set the start, then tap another for the destination.</p>}
              {result && !result.ok && <p className="error">{result.reason}</p>}
              {route && (
                <div className="route-summary">
                  <div className="route-head">
                    <p>
                      <b>{route.minutes} min</b> - {Math.round(route.walkDistance)} m walk
                      {routeFloors.length > 1 && <> - {routeFloors.map(floorName).join(' to ')}</>}
                    </p>
                    {!navigating && (
                      <button className="primary" onClick={() => setNavStep(0)}>
                        Start
                      </button>
                    )}
                  </div>
                  <ol className="steps">
                    {route.steps.map((s, i) => (
                      <li key={i} className={`${s.floorId === floor.id ? 'here' : ''}${navigating && i === navStep ? ' current' : ''}`}>
                        <button className="link" onClick={() => setFloorId(s.floorId)}>
                          {s.instruction}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          {mode === 'ask' && (
            <AssistantPanel
              key={building.id}
              building={building}
              fromId={fromId}
              accessible={accessible}
              blockedEdges={blocked}
              useAi={serverGemini}
              onRouteTo={routeTo}
            />
          )}

          {mode === 'report' && (
            <ReportsPanel
              building={building}
              reports={buildingReports}
              now={now}
              onConfirm={(id) => setReports((rs) => rs.map((r) => (r.id === id ? confirmReport(r) : r)))}
              onClear={(id) => setReports((rs) => rs.map((r) => (r.id === id ? clearReport(r) : r)))}
            />
          )}
          {(mode === 'navigate' || mode === 'ask') && live.length > 0 && (
            <p className="hint warn">
              {live.length} live report{live.length > 1 ? 's' : ''} affecting routes. Open <b>Report</b> to view.
            </p>
          )}

          {mode === 'edit' && (
            <EditorPanel
              tool={tool}
              setTool={(t) => (setTool(t), setConnectFrom(undefined), setEditMsg(undefined))}
              floor={floor}
              selected={selected}
              pendingConnect={pending}
              message={editMsg}
              onUpdateNode={(patch) => selected && setBuilding((b) => updateNode(b, selected.id, patch))}
              onDeleteNode={() => selected && (setBuilding((b) => deleteNode(b, selected.id)), setSelectedId(undefined))}
              onRenameFloor={(name) => setBuilding((b) => ({ ...b, floors: b.floors.map((f) => (f.id === floor.id ? { ...f, name } : f)) }))}
              onAddFloor={() => {
                const res = addFloor(building);
                setBuilding(res.building);
                setFloorId(res.floorId);
              }}
              onDeleteFloor={() => {
                if (building.floors.length <= 1) return setEditMsg('A building needs at least one floor.');
                const b = deleteFloor(building, floor.id);
                setBuilding(b);
                setFloorId(lowestFloor(b));
                setFromId(undefined);
                setToId(undefined);
              }}
              onExport={exportJson}
              onImportJson={importJson}
              onReset={() => {
                clearSavedBuildings();
                const fresh = createDefaultBuildings();
                const replacement = fresh.find((b) => b.id === building.id) ?? createSampleBuilding();
                setBuildings((all) => all.map((b) => (b.id === building.id ? replacement : b)));
                setFloorId(lowestFloor(replacement));
                setFromId(undefined);
                setToId(undefined);
                setSelectedId(undefined);
              }}
            />
          )}

          {mode === 'import' && (
            <ImportPanel
              key={building.id}
              building={building}
              serverGemini={serverGemini}
              onAddFloor={(part) => {
                setBuilding((b) => ({
                  ...b,
                  floors: [...b.floors, part.floor],
                  nodes: [...b.nodes, ...part.nodes],
                  edges: [...b.edges, ...part.edges],
                }));
                setFloorId(part.floor.id);
                setMode('edit');
                setTool('select');
                setToast(`${part.floor.name} added. Check positions and connections in Edit map.`);
              }}
            />
          )}
        </aside>

        <section className="map-wrap">
          <div className="floor-switch" role="tablist" aria-label="Floors">
            {floors.map((f) => (
              <button key={f.id} role="tab" aria-selected={f.id === floor.id} className={`${f.id === floor.id ? 'active' : ''}${routeFloors.includes(f.id) ? ' on-route' : ''}`} onClick={() => setFloorId(f.id)}>
                {f.name}
              </button>
            ))}
          </div>
          <div className={`map-frame mode-${mode}`}>
            <MapView
              building={building}
              floor={floor}
              route={mode === 'edit' ? null : route}
              blockedEdges={blocked}
              outShafts={outShafts}
              fromId={mode === 'edit' ? undefined : fromId}
              toId={mode === 'edit' ? undefined : toId}
              selectedNodeId={mode === 'edit' ? selectedId : undefined}
              pendingConnectId={connectFrom}
              walkerNodeId={stepNode?.nodeId}
              showCorridorNodes={mode === 'edit'}
              draggable={mode === 'edit' && tool === 'select'}
              onNodeClick={onNodeClick}
              onEdgeClick={mode === 'report' || (mode === 'edit' && tool === 'delete') ? onEdgeClick : undefined}
              onBackgroundClick={onBackgroundClick}
              onNodeDrag={(id, x, y) => setBuilding((b) => moveNode(b, id, x, y))}
            />
          </div>
          <div className="legend">
            <span><i className="sw route" /> Route</span>
            <span><i className="sw blocked" /> Blocked</span>
            <span><i className="sw stairs" /> S = Stairs</span>
            <span><i className="sw elevator" /> E = Elevator</span>
            {mode === 'report' && <span className="strong">Tap a corridor, elevator or stairwell to report it.</span>}
          </div>

          {navigating && route && (
            <NavigationHUD route={route} step={Math.min(navStep!, route.steps.length - 1)} floorName={floorName} onStep={setNavStep} onEnd={() => setNavStep(null)} />
          )}

          {reportDraft && (
            <div className="modal" role="dialog" aria-label={reportDraft.title}>
              <h3>{reportDraft.title}</h3>
              <input autoFocus placeholder="Optional note, e.g. wet floor, construction" value={reportNote} onChange={(e) => setReportNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitReport()} />
              <div className="row">
                <button className="primary" onClick={submitReport}>
                  Submit report
                </button>
                <button onClick={() => setReportDraft(null)}>Cancel</button>
              </div>
            </div>
          )}
          {toast && <div className="toast" role="status">{toast}</div>}
        </section>
      </main>
    </div>
  );
}
