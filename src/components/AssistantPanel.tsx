import { useState } from 'react';
import { askAssistant } from '../lib/assistant';
import type { Building } from '../lib/types';

/**
 * Wayfinding assistant chat (from FloorNav's AIWayfinderChat). Uses Gemini on
 * the server when configured; otherwise answers common questions locally with
 * the real router. Suggested places can be routed to in one tap.
 */
interface Props {
  building: Building;
  fromId?: string;
  accessible: boolean;
  blockedEdges: Set<string>;
  useAi: boolean;
  onRouteTo: (nodeId: string) => void;
}

interface Msg {
  id: number;
  from: 'user' | 'ai';
  text: string;
  destinationId?: string;
  source?: 'gemini' | 'local';
}

const SUGGESTIONS = ['Nearest washroom', 'Where can I get food?', 'Take me to the nearest exit', 'Where is the elevator?'];

export function AssistantPanel({ building, fromId, accessible, blockedEdges, useAi, onRouteTo }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, from: 'ai', text: `Hi! Ask me where anything is in ${building.name}, like a room number, the nearest washroom, or somewhere to eat.` },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setMsgs((m) => [...m, { id: Date.now(), from: 'user', text: q }]);
    setBusy(true);
    const a = await askAssistant(building, q, fromId, { accessible, blockedEdges, useAi });
    setMsgs((m) => [...m, { id: Date.now() + 1, from: 'ai', text: a.answer, destinationId: a.destinationId, source: a.source }]);
    setBusy(false);
  };

  const label = (id: string) => building.nodes.find((n) => n.id === id)?.label?.replace(/\s*\(Floor [^)]*\)$/, '') ?? id;

  return (
    <section className="panel assistant">
      <h2>Ask InsideOut</h2>
      {!fromId && <p className="hint">Set a starting point in Directions to get "nearest" answers from where you are.</p>}
      <div className="chat" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.from}`}>
            <p>{m.text}</p>
            {m.destinationId && (
              <button className="primary small" onClick={() => onRouteTo(m.destinationId!)}>
                Route to {label(m.destinationId)}
              </button>
            )}
            {m.source && <small className="muted">{m.source === 'gemini' ? 'Gemini' : 'On-device answer'}</small>}
          </div>
        ))}
        {busy && <div className="msg ai"><p>Thinking...</p></div>}
      </div>
      <div className="chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip-btn" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question" aria-label="Ask a question" />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
