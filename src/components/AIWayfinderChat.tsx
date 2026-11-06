import React, { useState } from 'react';
import { Sparkles, Send, X, ArrowRight, MapPin, Building, Bot } from 'lucide-react';
import { FloorPlanData, RoomPOI } from '../types/navigation';

interface AIWayfinderChatProps {
  isOpen: boolean;
  onClose: () => void;
  floorPlan: FloorPlanData;
  currentRoom: RoomPOI | null;
  onRouteToRoom: (room: RoomPOI) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  suggestedRoom?: RoomPOI;
}

export const AIWayfinderChat: React.FC<AIWayfinderChatProps> = ({
  isOpen,
  onClose,
  floorPlan,
  currentRoom,
  onRouteToRoom,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I'm your indoor wayfinding concierge for "${floorPlan.title}". Ask me where any room is, how to reach the nearest restroom, or the quickest accessible route.`,
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ask-wayfinder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlan,
          question: textToSend,
          currentRoomId: currentRoom?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Could not get response from wayfinder server');
      }

      const data = await response.json();
      const suggestedRoom = data.suggestedDestinationId
        ? floorPlan.rooms.find((r) => r.id === data.suggestedDestinationId)
        : undefined;

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.answer || 'I found the relevant areas on your floor plan.',
        suggestedRoom,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'ai',
          text: `I had trouble connecting to the server. You can select any room on the map directly to plan your route!`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sampleQuestions = [
    'Where is the nearest restroom?',
    'Find coffee or food nearby',
    'Where are the elevators to other floors?',
    'Fastest way to the emergency exit',
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-[#090e1b]/98 backdrop-blur-2xl border-l border-sky-500/30 shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col animate-in slide-in-from-right duration-250">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-slate-950 flex items-center justify-center shadow-md shadow-sky-500/25">
            <Sparkles className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Wayfinding Concierge</h3>
            <span className="text-[10px] font-mono text-sky-400/80 truncate block">
              {floorPlan.title}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`p-3 rounded-2xl max-w-[88%] text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-sky-500 text-slate-950 font-semibold rounded-br-none shadow-md shadow-sky-500/20'
                  : 'bg-slate-950/90 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
              }`}
            >
              <p>{msg.text}</p>
            </div>

            {/* If AI recommended a room, provide 1-tap route action */}
            {msg.suggestedRoom && (
              <div className="mt-2 p-2.5 bg-sky-950/50 border border-sky-500/40 rounded-xl text-xs flex items-center justify-between gap-2 max-w-[88%] shadow-md">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-bold text-white truncate">
                    {msg.suggestedRoom.name}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (msg.suggestedRoom) {
                      onRouteToRoom(msg.suggestedRoom);
                      onClose();
                    }
                  }}
                  className="px-2.5 py-1 bg-gradient-to-r from-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 text-slate-950 text-[10px] font-bold rounded-lg shrink-0 flex items-center gap-1 transition-all shadow-sm"
                >
                  <span>Route</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-2xl border border-slate-800 w-24">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-bounce [animation-delay:0.2s]" />
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-bounce [animation-delay:0.4s]" />
          </div>
        )}
      </div>

      {/* Suggested Quick Questions */}
      <div className="p-3 border-t border-slate-800/80 bg-[#070c17]">
        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
          SUGGESTED QUERIES:
        </span>
        <div className="flex flex-wrap gap-1">
          {sampleQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(q)}
              className="text-[11px] px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-sky-300 border border-slate-800/80 rounded-lg transition-colors text-left font-medium"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 border-t border-slate-800/80 bg-[#080d19] flex items-center gap-2"
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask where to go or how to get there..."
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || isLoading}
          className="p-2.5 bg-gradient-to-r from-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 disabled:opacity-40 text-slate-950 font-bold rounded-xl transition-all shadow-md shadow-sky-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
