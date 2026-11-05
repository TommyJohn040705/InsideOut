import { useRef } from 'react';
import type { Floor, MapNode, NodeKind } from '../lib/types';

export type EditorTool = 'select' | 'room' | 'corridor' | 'stairs' | 'elevator' | 'entrance' | 'connect' | 'delete';

const TOOLS: Array<{ id: EditorTool; label: string; hint: string }> = [
  { id: 'select', label: 'Select / move', hint: 'Click a point to edit it. Drag points to move them.' },
  { id: 'corridor', label: '+ Corridor point', hint: 'Click the map to add a corridor junction, then use Connect to join it up.' },
  { id: 'room', label: '+ Room', hint: 'Click the map to place a room. Connect its door to a corridor point.' },
  { id: 'entrance', label: '+ Entrance', hint: 'Click the map to place a building entrance.' },
  { id: 'stairs', label: '+ Stairs', hint: 'Place stairs, then Connect them to stairs on the floor above or below (switch floors between clicks).' },
  { id: 'elevator', label: '+ Elevator', hint: 'Place an elevator stop, then Connect it to the elevator on another floor.' },
  { id: 'connect', label: 'Connect', hint: 'Click two points to join them with a walkway. Stairs/elevators can be joined across floors.' },
  { id: 'delete', label: 'Delete', hint: 'Click a point or a corridor segment to delete it.' },
];

interface Props {
  tool: EditorTool;
  setTool: (t: EditorTool) => void;
  floor: Floor;
  selected?: MapNode;
  pendingConnect?: MapNode;
  message?: string;
  onUpdateNode: (patch: { label?: string; aliases?: string[]; kind?: NodeKind }) => void;
  onDeleteNode: () => void;
  onRenameFloor: (name: string) => void;
  onAddFloor: () => void;
  onDeleteFloor: () => void;
  onExport: () => void;
  onImportJson: (file: File) => void;
  onReset: () => void;
}

export function EditorPanel(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const active = TOOLS.find((t) => t.id === p.tool)!;
  return (
    <section className="panel">
      <h2>Edit floor plan</h2>
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={p.tool === t.id ? 'active' : ''} onClick={() => p.setTool(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="hint">{active.hint}</p>
      {p.pendingConnect && (
        <p className="hint strong">
          Connecting from <b>{p.pendingConnect.label ?? 'corridor point'}</b>. Click the second point.
        </p>
      )}
      {p.message && <p className="error">{p.message}</p>}

      {p.selected && p.tool === 'select' && (
        <div className="props" key={p.selected.id}>
          <h3>Selected point</h3>
          <label>
            Type
            <select value={p.selected.kind} onChange={(e) => p.onUpdateNode({ kind: e.target.value as NodeKind })}>
              {(['room', 'corridor', 'entrance', 'stairs', 'elevator'] as NodeKind[]).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input defaultValue={p.selected.label ?? ''} onBlur={(e) => p.onUpdateNode({ label: e.target.value.trim() || undefined })} />
          </label>
          <label>
            Search aliases (comma separated)
            <input
              defaultValue={(p.selected.aliases ?? []).join(', ')}
              onBlur={(e) =>
                p.onUpdateNode({
                  aliases: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <small className="muted">
            Position: {p.selected.x.toFixed(1)}, {p.selected.y.toFixed(1)} m
          </small>
          <button className="danger" onClick={p.onDeleteNode}>
            Delete point
          </button>
        </div>
      )}

      <div className="props">
        <h3>Floor</h3>
        <label>
          Floor name
          <input key={p.floor.id} defaultValue={p.floor.name} onBlur={(e) => e.target.value.trim() && p.onRenameFloor(e.target.value.trim())} />
        </label>
        <div className="row">
          <button onClick={p.onAddFloor}>Add floor above</button>
          <button className="danger" onClick={p.onDeleteFloor}>
            Delete this floor
          </button>
        </div>
      </div>

      <div className="props">
        <h3>Building file</h3>
        <p className="muted">Edits save automatically in this browser.</p>
        <div className="row">
          <button onClick={p.onExport}>Export JSON</button>
          <button onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className="danger" onClick={p.onReset}>
            Reset to demo
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImportJson(f);
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
