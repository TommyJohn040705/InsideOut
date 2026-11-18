/**
 * Draw a floor's corridor network by hand on the floor-plan sheet: click along a corridor to lay
 * a line of points, click an existing point to join lines, then link every room to its nearest
 * corridor point. The result is the same hallway graph E5 uses for routing.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Undo2, Trash2, Link2, ZoomIn, ZoomOut, PenLine, Save } from 'lucide-react';
import type { CorridorNode, RoomPOI } from '../../types/navigation';
import { graphProblems } from '../../campus/floorImports';

interface Props {
  imageUrl: string;
  imageSize: [number, number];
  rooms: RoomPOI[];
  hallways: CorridorNode[];
  idPrefix: string;
  busy: boolean;
  onSave: (hallways: CorridorNode[]) => void;
}

/** A room links to its nearest corridor point only if it is this close (percent of the sheet's longer side). */
export const ROOM_LINK_MAX = 4;

/** Adds an undirected edge between two hallway nodes. */
function join(nodes: CorridorNode[], a: string, b: string): CorridorNode[] {
  if (a === b) return nodes;
  return nodes.map((n) => (n.id === a && !n.connectedTo.includes(b) ? { ...n, connectedTo: [...n.connectedTo, b] } : n.id === b && !n.connectedTo.includes(a) ? { ...n, connectedTo: [...n.connectedTo, a] } : n));
}

/** Links each room to the nearest hallway node within ROOM_LINK_MAX; replaces earlier room links. */
export function linkRooms(nodes: CorridorNode[], rooms: RoomPOI[], aspect: number): { nodes: CorridorNode[]; linked: number } {
  const roomIds = new Set(rooms.map((r) => r.id));
  let out = nodes.map((n) => ({ ...n, connectedTo: n.connectedTo.filter((t) => !roomIds.has(t)) }));
  let linked = 0;
  // Distances in a square frame: x scaled by the sheet's aspect ratio (width / height).
  const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot((p.x - q.x) * Math.min(1, aspect), (p.y - q.y) * Math.min(1, 1 / aspect));
  for (const r of rooms) {
    let best: CorridorNode | null = null, bd = Infinity;
    for (const n of out) { const v = d(n.coords, r.coords); if (v < bd) { bd = v; best = n; } }
    if (best && bd <= ROOM_LINK_MAX) { out = out.map((n) => (n.id === best!.id ? { ...n, connectedTo: [...n.connectedTo, r.id] } : n)); linked++; }
  }
  return { nodes: out, linked };
}

export function HallwayEditor({ imageUrl, imageSize, rooms, hallways, idPrefix, busy, onSave }: Props) {
  const [nodes, setNodes] = useState<CorridorNode[]>(hallways);
  const [history, setHistory] = useState<CorridorNode[][]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [drawing, setDrawing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const counter = useRef(hallways.length);
  const aspect = imageSize[0] / imageSize[1];
  const dirty = JSON.stringify(nodes) !== JSON.stringify(hallways);
  const problems = useMemo(() => graphProblems([], nodes), [nodes]);
  const unlinked = useMemo(() => { const l = new Set(nodes.flatMap((n) => n.connectedTo)); return rooms.filter((r) => !l.has(r.id)); }, [rooms, nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const roomIds = useMemo(() => new Set(rooms.map((r) => r.id)), [rooms]);

  const change = (next: CorridorNode[]) => { setHistory((h) => [...h.slice(-50), nodes]); setNodes(next); };

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawing) return;
    const box = e.currentTarget.getBoundingClientRect();
    const p = { x: +(((e.clientX - box.left) / box.width) * 100).toFixed(2), y: +(((e.clientY - box.top) / box.height) * 100).toFixed(2) };
    // Clicking near an existing point joins to it instead of adding one (8 screen pixels).
    const tol = (8 / box.width) * 100;
    const hit = nodes.find((n) => Math.abs(n.coords.x - p.x) < tol && Math.abs(n.coords.y - p.y) * (box.height / box.width) < tol);
    if (hit) { change(sel ? join(nodes, sel, hit.id) : nodes); setSel(hit.id); return; }
    const id = `${idPrefix}-h${++counter.current}`;
    const added = [...nodes, { id, coords: p, connectedTo: [] } as CorridorNode];
    change(sel ? join(added, sel, id) : added);
    setSel(id);
  };

  const undo = () => { const prev = history[history.length - 1]; if (!prev) return; setHistory((h) => h.slice(0, -1)); setNodes(prev); setSel(null); };
  const link = () => { const r = linkRooms(nodes, rooms, aspect); change(r.nodes); setMsg(`${r.linked} of ${rooms.length} rooms linked to a corridor point. Rooms farther than the limit stay unlinked: draw a point outside their door and link again.`); };

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="text-[11px] font-bold text-slate-500 uppercase flex-1">Hallways ({nodes.length} points)</div>
        <button onClick={() => { setDrawing((v) => !v); setSel(null); }} aria-pressed={drawing} className={`h-7 px-2 rounded-lg text-[11px] font-bold flex items-center gap-1 ${drawing ? 'bg-indigo-600 text-white' : 'ring-1 ring-slate-200'}`}><PenLine className="w-3.5 h-3.5" /> {drawing ? 'Drawing' : 'Draw'}</button>
        <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 2))} className="h-7 w-7 rounded-lg ring-1 ring-slate-200 flex items-center justify-center"><ZoomOut className="w-3.5 h-3.5" /></button>
        <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 2))} className="h-7 w-7 rounded-lg ring-1 ring-slate-200 flex items-center justify-center"><ZoomIn className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-[11px] text-slate-500">
        {drawing
          ? 'Click along the middle of a corridor to lay points; each click joins to the last one. Click an existing point to connect to it or to start a new line from it. Press "End line" before starting a separate corridor.'
          : 'Turn on Draw, trace every corridor, then link the rooms. Lines must stay inside corridors: routes follow them exactly.'}
      </p>
      <div className="max-h-[50vh] overflow-auto ring-1 ring-slate-200 rounded-lg bg-slate-50">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          <img src={imageUrl} alt="Floor plan for drawing hallways" className="w-full select-none block" draggable={false} />
          <svg className={`absolute inset-0 w-full h-full ${drawing ? 'cursor-crosshair' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none" onClick={click} role="img" aria-label="Hallway drawing layer">
            {nodes.flatMap((n) => n.connectedTo.filter((t) => byId.has(t) && n.id < t).map((t) => (
              <line key={`${n.id}-${t}`} x1={n.coords.x} y1={n.coords.y} x2={byId.get(t)!.coords.x} y2={byId.get(t)!.coords.y} stroke="#2563eb" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }} />
            )))}
            {nodes.flatMap((n) => n.connectedTo.filter((t) => roomIds.has(t)).map((t) => { const r = rooms.find((x) => x.id === t)!; return <line key={`${n.id}-${t}`} x1={n.coords.x} y1={n.coords.y} x2={r.coords.x} y2={r.coords.y} stroke="#059669" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.5 }} />; }))}
            {rooms.map((r) => <circle key={r.id} cx={r.coords.x} cy={r.coords.y} r={0.35} fill="#dc2626" />)}
            {nodes.map((n) => <circle key={n.id} cx={n.coords.x} cy={n.coords.y} r={n.id === sel ? 0.6 : 0.4} fill={n.id === sel ? '#f59e0b' : '#1d4ed8'} stroke="#fff" strokeWidth={0.1} />)}
          </svg>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <button disabled={!sel} onClick={() => setSel(null)} className="h-8 px-2 rounded-lg ring-1 ring-slate-200 text-[11px] font-bold disabled:opacity-40">End line</button>
        <button disabled={!history.length} onClick={undo} className="h-8 px-2 rounded-lg ring-1 ring-slate-200 text-[11px] font-bold flex items-center gap-1 disabled:opacity-40"><Undo2 className="w-3.5 h-3.5" /> Undo</button>
        <button disabled={!nodes.length || !rooms.length} onClick={link} className="h-8 px-2 rounded-lg ring-1 ring-slate-200 text-[11px] font-bold flex items-center gap-1 disabled:opacity-40"><Link2 className="w-3.5 h-3.5" /> Link rooms</button>
        <button disabled={!nodes.length} onClick={() => { if (confirm('Remove every hallway point on this floor?')) { change([]); setSel(null); } }} className="h-8 px-2 rounded-lg ring-1 ring-slate-200 text-[11px] font-bold flex items-center gap-1 text-red-700 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /> Clear</button>
        <button disabled={!dirty || busy} onClick={() => onSave(nodes)} className="h-8 px-3 rounded-lg bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 ml-auto disabled:bg-slate-300"><Save className="w-3.5 h-3.5" /> Save hallways</button>
      </div>
      {msg && <p role="status" className="text-[11px] text-slate-700 bg-slate-50 rounded-lg p-2">{msg}</p>}
      {nodes.length > 0 && (problems.length
        ? <p className="text-[11px] text-amber-900 bg-amber-50 rounded-lg p-2">Not routable yet: {problems.join(' ')}</p>
        : <p className="text-[11px] text-emerald-800 bg-emerald-50 rounded-lg p-2">Connected network{unlinked.length ? `; ${unlinked.length} rooms not linked yet (${unlinked.slice(0, 5).map((r) => r.roomNumber || r.name).join(', ')}${unlinked.length > 5 ? ', ...' : ''}); routes to those join the nearest corridor point in a straight line` : ', every room linked'}. Save, then tick the review box to switch on routing.</p>)}
    </section>
  );
}
