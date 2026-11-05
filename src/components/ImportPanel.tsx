import { useState } from 'react';
import { CameraCapture } from './CameraCapture';
import {
  analyseFloorPlan,
  draftToFloor,
  fileToDataUrl,
  listShafts,
  parseDraft,
  SAMPLE_DRAFT_JSON,
  type FloorPlanDraft,
} from '../lib/floorPlanImport';
import type { Building, Floor, MapEdge, MapNode } from '../lib/types';

interface Props {
  building: Building;
  serverGemini: boolean;
  onAddFloor: (part: { floor: Floor; nodes: MapNode[]; edges: MapEdge[] }) => void;
}

const ENV_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? '';
const HINTS = ['University / School', 'Office', 'Hospital', 'Airport', 'Shopping mall', 'Hotel', 'Museum', 'Residential'];

/** Downscales an image to at most `max` px on its long side; returns data URL and aspect ratio. */
async function prepareImage(dataUrl: string, max = 1600): Promise<{ dataUrl: string; aspect: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const aspect = img.naturalHeight / img.naturalWidth || 0.5;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale >= 1 && dataUrl.length < 2_000_000) return { dataUrl, aspect };
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.85), aspect };
}

export function ImportPanel({ building, serverGemini, onAddFloor }: Props) {
  const [apiKey, setApiKey] = useState(ENV_KEY);
  const [image, setImage] = useState<{ dataUrl: string; aspect: number } | null>(null);
  const [hint, setHint] = useState(HINTS[0]);
  const [camera, setCamera] = useState(false);
  const [draft, setDraft] = useState<FloorPlanDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextLevel = Math.max(0, ...building.floors.map((f) => f.level)) + 1;
  const [floorName, setFloorName] = useState(`Floor ${nextLevel}`);
  const [level, setLevel] = useState(nextLevel);
  const [widthM, setWidthM] = useState(60);
  const [hover, setHover] = useState<string | null>(null);
  const [keepImage, setKeepImage] = useState(true);
  const canAnalyse = serverGemini || apiKey.trim().length > 0;

  const takeImage = async (dataUrl: string) => {
    setError(null);
    setDraft(null);
    try {
      setImage(await prepareImage(dataUrl));
    } catch {
      setError('That image could not be read.');
    }
  };

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      setDraft(await analyseFloorPlan(image.dataUrl, { apiKey: apiKey.trim() || undefined, buildingTypeHint: hint }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const useSample = () => {
    setError(null);
    setImage(null);
    setDraft(parseDraft(SAMPLE_DRAFT_JSON));
  };

  const update = <K extends 'rooms' | 'walkways' | 'connectors'>(k: K, id: string, patch: Partial<FloorPlanDraft[K][number]>) =>
    setDraft((d) => (d ? { ...d, [k]: (d[k] as Array<{ id: string }>).map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d));

  const aspect = image?.aspect ?? 0.5;
  const commit = () => {
    if (!draft) return;
    onAddFloor(
      draftToFloor(draft, building, {
        floorName,
        level,
        widthMetres: widthM,
        aspectRatio: aspect,
        imageUrl: keepImage ? image?.dataUrl : undefined,
      }),
    );
    setDraft(null);
    setImage(null);
    setFloorName(`Floor ${level + 1}`);
    setLevel(level + 1);
  };

  const accepted = draft
    ? draft.rooms.filter((r) => r.accepted).length + draft.walkways.filter((w) => w.accepted).length + draft.connectors.filter((c) => c.accepted).length
    : 0;

  return (
    <section className="panel">
      <h2>Add a floor from a plan (AI assisted)</h2>
      <ol className="steps-list">
        <li>Photograph a posted floor plan or upload an image.</li>
        <li>Gemini detects rooms, corridors, stairs and elevators.</li>
        <li>You check every item before it goes on the map.</li>
      </ol>

      {camera ? (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCapture={(d) => {
            setCamera(false);
            takeImage(d);
          }}
        />
      ) : (
        <div className="row">
          <button onClick={() => setCamera(true)}>Scan with camera</button>
          <label className="button-like">
            Upload image
            <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && takeImage(await fileToDataUrl(e.target.files[0]))} />
          </label>
          <button onClick={useSample}>Try a sample result</button>
        </div>
      )}

      {image && !draft && <img className="plan-thumb" src={image.dataUrl} alt="Floor plan to analyse" />}

      <label>
        Building type (helps the AI)
        <select value={hint} onChange={(e) => setHint(e.target.value)}>
          {HINTS.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
      </label>
      {serverGemini ? (
        <p className="muted">Gemini is configured on the server.</p>
      ) : (
        <>
          <label>
            Gemini API key
            <input type="password" value={apiKey} placeholder="Paste a key from Google AI Studio" onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <small className="muted">No server key found. A pasted key stays in this browser tab and is sent only to Google.</small>
        </>
      )}
      <div className="row">
        <button className="primary" disabled={!image || !canAnalyse || busy} onClick={run}>
          {busy ? 'Analysing...' : 'Analyse with Gemini'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {draft && (
        <>
          <h3>Review detected items</h3>
          {draft.summary && <p className="muted">{draft.summary}</p>}
          <div className="draft-preview" style={{ aspectRatio: `${1 / aspect}` }}>
            {image && <img src={image.dataUrl} alt="Uploaded floor plan" />}
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
              {draft.walkways.map((w) => (
                <polyline key={w.id} className={`d-walk${w.accepted ? '' : ' rejected'}${hover === w.id ? ' hover' : ''}`} points={w.points.map((p) => p.join(',')).join(' ')} />
              ))}
              {draft.rooms.map((r) => (
                <rect key={r.id} className={`d-room${r.accepted ? '' : ' rejected'}${hover === r.id ? ' hover' : ''}`} x={r.x} y={r.y} width={r.width} height={r.height} />
              ))}
              {draft.connectors.map((c) => (
                <circle key={c.id} className={`d-conn ${c.kind}${c.accepted ? '' : ' rejected'}${hover === c.id ? ' hover' : ''}`} cx={c.x} cy={c.y} r={14} />
              ))}
            </svg>
          </div>

          <div className="draft-list">
            <h4>Rooms ({draft.rooms.length})</h4>
            {draft.rooms.map((r) => (
              <div key={r.id} className="draft-item" onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
                <input type="checkbox" checked={r.accepted} onChange={(e) => update('rooms', r.id, { accepted: e.target.checked })} aria-label={`Keep ${r.label}`} />
                <input value={r.label} onChange={(e) => update('rooms', r.id, { label: e.target.value })} aria-label="Room name" />
                {r.category && <small className="chip">{r.category}</small>}
              </div>
            ))}
            <h4>Corridor segments ({draft.walkways.length})</h4>
            {draft.walkways.map((w, i) => (
              <div key={w.id} className="draft-item" onMouseEnter={() => setHover(w.id)} onMouseLeave={() => setHover(null)}>
                <input type="checkbox" checked={w.accepted} onChange={(e) => update('walkways', w.id, { accepted: e.target.checked })} aria-label={`Keep corridor ${i + 1}`} />
                <span>Corridor {i + 1}</span>
              </div>
            ))}
            <h4>Stairs and elevators ({draft.connectors.length})</h4>
            {draft.connectors.map((c) => (
              <div key={c.id} className="draft-item col" onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
                <div className="draft-item">
                  <input type="checkbox" checked={c.accepted} onChange={(e) => update('connectors', c.id, { accepted: e.target.checked })} aria-label={`Keep ${c.label}`} />
                  <input value={c.label} onChange={(e) => update('connectors', c.id, { label: e.target.value })} aria-label="Name" />
                </div>
                <select value={c.linkShaftId ?? ''} onChange={(e) => update('connectors', c.id, { linkShaftId: e.target.value || undefined })} aria-label={`Link ${c.label} to another floor`}>
                  <option value="">Not linked to another floor</option>
                  {listShafts(building, c.kind).map((s) => (
                    <option key={s.shaftId} value={s.shaftId}>
                      Same {c.kind} as: {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="props">
            <label>
              Floor name
              <input value={floorName} onChange={(e) => setFloorName(e.target.value)} />
            </label>
            <div className="row">
              <label>
                Level
                <input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))} />
              </label>
              <label>
                Plan width (m)
                <input type="number" min={5} value={widthM} onChange={(e) => setWidthM(Math.max(5, Number(e.target.value)))} />
              </label>
            </div>
            {image && (
              <label className="toggle">
                <input type="checkbox" checked={keepImage} onChange={(e) => setKeepImage(e.target.checked)} />
                Show the plan image behind the map
              </label>
            )}
            <button className="primary" disabled={accepted === 0} onClick={commit}>
              Add verified floor ({accepted} items)
            </button>
            <small className="muted">Afterwards, use Edit map to fine-tune positions and connections.</small>
          </div>
        </>
      )}
    </section>
  );
}
