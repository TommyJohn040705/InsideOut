import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, ExternalLink, Navigation2, Globe, CheckCircle2, MapPin } from 'lucide-react';
import { FloorPlanData, RoomPOI, IndoorLocationState, NavigationRoute } from '../types/navigation';
import { answerLocally } from '../utils/localAssistant';
import { E5_FACTS, factText } from '../data/e5/facts';
import { cx } from './Panels';
import { MicButton } from './MicButton';
import { resolveCheckpoint } from '../data/e5/checkpoints';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  room?: RoomPOI;
  sources?: { title: string; url: string }[];
  offline?: boolean;
  toolExecuted?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  plan: FloorPlanData;
  plans: FloorPlanData[];
  start: RoomPOI | null;
  destination: RoomPOI | null;
  route: NavigationRoute | null;
  locationState?: IndoorLocationState | null;
  accessible: boolean;
  isE5: boolean;
  onGo: (room: RoomPOI) => void;
  onSetStartRoom: (room: RoomPOI) => void;
  onSwitchFloor: (floor: number) => void;
  onSetCheckpoint: (code: string) => void;
  onReroute: () => void;
  onLookup: () => void;
  onReportIssue?: (issue: { type: string; roomId?: string; details: string }) => void;
}

const SUGGESTIONS = [
  'Where am I?',
  "I'm standing near E5 2108",
  'Take me to Classroom 3101',
  'Find the nearest accessible washroom',
  'Which elevator do I use?',
  'I took the wrong hallway. Can you reroute?',
  'Show Floor 3',
];

export function Assistant({
  open,
  onClose,
  plan,
  plans,
  start,
  destination,
  route,
  locationState,
  accessible,
  isE5,
  onGo,
  onSetStartRoom,
  onSwitchFloor,
  onSetCheckpoint,
  onReroute,
  onLookup,
  onReportIssue,
}: Props) {
  const building = plan.buildingName || plan.title;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([
        {
          role: 'bot',
          text: `Hi! I'm FloorNav AI. I can control the map, find rooms, select elevators, set your position, or reroute you.${
            start ? ` You are currently at ${start.roomNumber || start.name} (Level ${start.floor || plan.floorNumber}).` : ''
          }`,
        },
      ]);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy]);

  const allRooms = plans.flatMap((p) => p.rooms.map((r) => ({ ...r, floor: r.floor ?? p.floorNumber })));

  const findRoom = (idOrNumber?: string): RoomPOI | undefined => {
    if (!idOrNumber) return undefined;
    const clean = idOrNumber.trim().toUpperCase().replace(/^E5[\s-]*/i, '');
    return allRooms.find(
      (r) =>
        r.id.toUpperCase() === clean ||
        (r.roomNumber && r.roomNumber.toUpperCase() === clean) ||
        r.name.toUpperCase().includes(clean)
    );
  };

  const executeToolCall = (name: string, args: any): { feedback?: string; targetRoom?: RoomPOI } => {
    switch (name) {
      case 'getCurrentIndoorPosition': {
        const roomDesc = start ? `${start.roomNumber || start.name} on Level ${start.floor || plan.floorNumber}` : 'unknown starting room';
        const chk = locationState?.checkpointCode ? ` (${locationState.checkpointCode})` : '';
        return { feedback: `Current position: ${roomDesc}${chk}. Accuracy: ${locationState?.status || 'manual'}.` };
      }

      case 'setPositionFromCheckpoint': {
        const code = args.checkpointCode || args.checkpointId;
        if (code) {
          onSetCheckpoint(code);
          const chk = resolveCheckpoint(code);
          if (chk) {
            onSwitchFloor(chk.floor);
            const r = findRoom(chk.roomNumber || chk.roomId);
            if (r) onSetStartRoom(r);
            return { feedback: `Location set to approved checkpoint ${chk.code} (${chk.name}) on Level ${chk.floor}.`, targetRoom: r };
          }
        }
        return { feedback: `Set location from checkpoint: ${code}` };
      }

      case 'setManualPosition': {
        const r = findRoom(args.roomNumberOrId || args.roomId);
        if (r) {
          onSetStartRoom(r);
          if (r.floor) onSwitchFloor(r.floor);
          return { feedback: `Updated starting location to E5 ${r.roomNumber || r.name} on Level ${r.floor}.`, targetRoom: r };
        }
        return { feedback: `Could not find room ${args.roomNumberOrId}` };
      }

      case 'findRoom': {
        const r = findRoom(args.query);
        if (r) {
          if (r.floor) onSwitchFloor(r.floor);
          return { feedback: `Found E5 ${r.roomNumber || r.name} on Level ${r.floor}.`, targetRoom: r };
        }
        return { feedback: `Room "${args.query}" was not found in the E5 directory.` };
      }

      case 'findNearestFacility': {
        const cat = String(args.category || 'restroom').toLowerCase();
        const local = answerLocally(`nearest ${cat}`, start, plans, accessible, isE5);
        if (local && local.room) {
          return { feedback: local.answer, targetRoom: local.room };
        }
        return { feedback: `Searching for nearest ${cat}...` };
      }

      case 'selectDestination': {
        const r = findRoom(args.roomNumberOrId);
        if (r) {
          onGo(r);
          return { feedback: `Destination set to ${r.roomNumber || r.name} on Level ${r.floor}. Route calculated!`, targetRoom: r };
        }
        return { feedback: `Could not set destination: room not found.` };
      }

      case 'calculateIndoorRoute': {
        const dest = findRoom(args.destinationRoomNumberOrId);
        if (dest) {
          if (args.startRoomNumberOrId) {
            const st = findRoom(args.startRoomNumberOrId);
            if (st) onSetStartRoom(st);
          }
          onGo(dest);
          return { feedback: `Calculated route to E5 ${dest.roomNumber || dest.name} on Level ${dest.floor}.`, targetRoom: dest };
        }
        return { feedback: `Route calculation destination not found.` };
      }

      case 'rerouteFromCurrentPosition': {
        onReroute();
        return { feedback: 'Recalculating route from your current verified position.' };
      }

      case 'showFloor': {
        const f = Number(args.floorNumber);
        if (f >= 1 && f <= 6) {
          onSwitchFloor(f);
          return { feedback: `Switched map view to Level ${f}.` };
        }
        return {};
      }

      case 'reportMapIssue': {
        onReportIssue?.({
          type: args.issueType || 'other',
          roomId: args.roomNumberOrId,
          details: args.details || '',
        });
        return { feedback: `Map report recorded: ${args.details || args.issueType}. Thank you for helping keep E5 updated!` };
      }

      default:
        return {};
    }
  };

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setQ('');
    setMsgs((m) => [...m, { role: 'user', text: t }]);

    setBusy(true);
    try {
      // 1. Try server Gemini assistant with structured tool calling
      const res = await fetch('/api/assistant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: t,
          currentState: {
            currentFloor: plan.floorNumber,
            startRoom: start ? { id: start.id, roomNumber: start.roomNumber, name: start.name, floor: start.floor } : null,
            destinationRoom: destination ? { id: destination.id, roomNumber: destination.roomNumber, name: destination.name, floor: destination.floor } : null,
            isNavigating: Boolean(route),
            isAccessibleOnly: accessible,
            locationStatus: locationState?.status || 'manual',
            checkpoint: locationState?.checkpointCode,
            totalDistanceMeters: route?.totalDistanceMeters,
          },
          buildingFacts: isE5 ? E5_FACTS.map(factText) : [],
          directory: allRooms.map((r) => ({ id: r.id, roomNumber: r.roomNumber, name: r.name, floor: r.floor })),
        }),
      });

      if (!res.ok) {
        throw new Error('Server AI chat returned non-200');
      }

      const data = await res.json();
      const toolCalls: Array<{ name: string; args: any }> = Array.isArray(data.toolCalls) ? data.toolCalls : [];

      let executedFeedback = '';
      let targetRoom: RoomPOI | undefined;

      for (const tc of toolCalls) {
        const exec = executeToolCall(tc.name, tc.args);
        if (exec.feedback) executedFeedback += `\n${exec.feedback}`;
        if (exec.targetRoom) targetRoom = exec.targetRoom;
      }

      const botText = (data.answer || '') + (executedFeedback ? ` ${executedFeedback.trim()}` : '');

      setMsgs((m) => [
        ...m,
        {
          role: 'bot',
          text: botText.trim() || 'Done.',
          room: targetRoom,
          toolExecuted: toolCalls.length > 0 ? toolCalls.map((c) => c.name).join(', ') : undefined,
        },
      ]);
    } catch {
      // 2. Offline directory fallback
      const local = answerLocally(t, start, plans, accessible, isE5);
      if (local) {
        setMsgs((m) => [
          ...m,
          {
            role: 'bot',
            text: `${local.answer} (Local offline directory)`,
            room: local.room,
            sources: local.sources,
          },
        ]);
      } else {
        setMsgs((m) => [
          ...m,
          {
            role: 'bot',
            offline: true,
            text:
              'Running in offline mode. I can answer: nearest washroom, elevator, stairs or entrance, food, and "where is room 3101". All E5 maps and turn-by-turn routes remain fully functional locally.',
          },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md h-[88dvh] sm:h-[660px] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-slate-900">FloorNav AI Assistant</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Tool Calling</span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              {building} · Level {plan.floorNumber}
              {start ? ` · Near ${start.roomNumber || start.name}` : ''}
            </p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cx(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug',
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md shadow-xs'
                    : 'bg-slate-100 text-slate-900 rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-line">{m.text}</p>

                {m.toolExecuted && (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Tool: {m.toolExecuted}</span>
                  </div>
                )}

                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 space-y-0.5 border-t border-slate-200/50 pt-1.5">
                    {m.sources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-semibold text-blue-700"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {s.title}
                      </a>
                    ))}
                  </div>
                )}

                {m.room && (
                  <button
                    onClick={() => {
                      onGo(m.room!);
                      onClose();
                    }}
                    className="mt-2 h-9 px-3.5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Navigation2 className="w-3.5 h-3.5 fill-current" /> Navigate to {m.room.roomNumber || m.room.name}
                  </button>
                )}

                {m.offline && (
                  <button
                    onClick={() => {
                      onClose();
                      onLookup();
                    }}
                    className="mt-2 h-9 px-3 rounded-full ring-1 ring-slate-300 bg-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5" /> Open Room Directory
                  </button>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 py-1">
              <Sparkles className="w-4 h-4 text-blue-600 animate-spin" />
              <span>Analyzing layout and calling navigation tools...</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestion Chips */}
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="shrink-0 h-8 px-3 rounded-full ring-1 ring-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          className="p-3 pt-1 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center gap-2 border-t border-slate-100 bg-white"
        >
          <div className="flex-1 relative flex items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask AI (e.g. Take me to 3101)..."
              className="w-full h-12 pl-4 pr-12 rounded-full ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-[15px]"
            />
            <div className="absolute right-1">
              <MicButton
                size="md"
                onTranscript={(text) => setQ(text)}
                onFinalTranscript={(text) => {
                  setQ(text);
                  ask(text);
                }}
              />
            </div>
          </div>
          <button
            aria-label="Send"
            type="submit"
            disabled={busy || !q.trim()}
            className="w-12 h-12 shrink-0 rounded-full bg-blue-600 disabled:bg-slate-200 text-white flex items-center justify-center transition-colors shadow-xs"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
