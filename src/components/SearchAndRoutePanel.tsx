import React, { useState } from 'react';
import {
  ArrowUpDown,
  Navigation,
  Compass,
  MapPin,
  Clock,
  Footprints,
  Accessibility,
  Search,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Check,
  Building,
  ShieldCheck,
  HelpCircle,
  AlertTriangle,
  Volume2,
  VolumeX,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';
import { FloorPlanData, RoomPOI, NavigationRoute, Point } from '../types/navigation';
import { E5_ROOMS, E5_FACILITIES } from '../data/e5/e5DataLoader';

interface SearchAndRoutePanelProps {
  currentPlan: FloorPlanData;
  allPlans: FloorPlanData[];
  route: NavigationRoute | null;
  selectedStartPOI: RoomPOI | null;
  selectedEndPOI: RoomPOI | null;
  isNavigating: boolean;
  isSimulatingWalk: boolean;
  isAccessibleOnly: boolean;
  isVoiceActive: boolean;
  currentStepIndex: number;
  onSelectStartPOI: (poi: RoomPOI | null) => void;
  onSelectEndPOI: (poi: RoomPOI | null) => void;
  onSelectFloor: (floorPlan: FloorPlanData) => void;
  onSwapPoints: () => void;
  onStartNavigation: () => void;
  onToggleSimulateWalk: () => void;
  onToggleAccessibleOnly: () => void;
  onToggleVoice: () => void;
  onOpenWayfinderChat: () => void;
  onInspectRoom: (room: RoomPOI) => void;
}

export const SearchAndRoutePanel: React.FC<SearchAndRoutePanelProps> = ({
  currentPlan,
  allPlans,
  route,
  selectedStartPOI,
  selectedEndPOI,
  isNavigating,
  isSimulatingWalk,
  isAccessibleOnly,
  isVoiceActive,
  currentStepIndex,
  onSelectStartPOI,
  onSelectEndPOI,
  onSelectFloor,
  onSwapPoints,
  onStartNavigation,
  onToggleSimulateWalk,
  onToggleAccessibleOnly,
  onToggleVoice,
  onOpenWayfinderChat,
  onInspectRoom,
}) => {
  const [globalSearch, setGlobalSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [originSearch, setOriginSearch] = useState('');
  const [isSelectingOrigin, setIsSelectingOrigin] = useState(false);
  const [destSearch, setDestSearch] = useState('');
  const [isSelectingDest, setIsSelectingDest] = useState(false);

  // Global search across all E5 rooms or current plan
  const searchResults = React.useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];

    const pool = currentPlan.buildingId === 'uwaterloo-e5' ? E5_ROOMS : currentPlan.rooms;
    return pool
      .filter((r) => {
        const matchNum = r.roomNumber?.toLowerCase().includes(q);
        const matchName = r.name.toLowerCase().includes(q);
        const matchPurp = r.purpose?.toLowerCase().includes(q);
        const matchCat = r.category.toLowerCase().includes(q);
        return matchNum || matchName || matchPurp || matchCat;
      })
      .slice(0, 15);
  }, [globalSearch, currentPlan]);

  const originPool = currentPlan.buildingId === 'uwaterloo-e5' ? E5_ROOMS : currentPlan.rooms;
  const filteredOrigins = originPool
    .filter((r) => {
      const q = originSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.roomNumber && r.roomNumber.toLowerCase().includes(q)) ||
        r.category.toLowerCase().includes(q)
      );
    })
    .slice(0, 10);

  const destPool = currentPlan.buildingId === 'uwaterloo-e5' ? E5_ROOMS : currentPlan.rooms;
  const filteredDests = destPool
    .filter((r) => {
      const q = destSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.roomNumber && r.roomNumber.toLowerCase().includes(q)) ||
        r.category.toLowerCase().includes(q)
      );
    })
    .slice(0, 10);

  const handleSelectSearchResult = (room: RoomPOI) => {
    // If room is on another floor, switch to that floor
    if (room.floor && room.floor !== currentPlan.floorNumber) {
      const targetPlan = allPlans.find((p) => p.floorNumber === room.floor);
      if (targetPlan) {
        onSelectFloor(targetPlan);
      }
    }
    onInspectRoom(room);
    onSelectEndPOI(room);
    setGlobalSearch('');
    setIsSearching(false);
  };

  return (
    <div className="hidden lg:flex flex-col h-full bg-[#0a0f1d] border-r border-slate-800/80 w-[410px] shrink-0 overflow-y-auto select-none">
      {/* Building & Active Floor Header */}
      <div className="p-4 border-b border-slate-800/80 bg-[#080d1a]/80">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-sky-400 font-mono uppercase tracking-wider font-semibold">
              <Building className="w-3.5 h-3.5" />
              <span>{currentPlan.buildingName || currentPlan.buildingType}</span>
            </div>
            <h2 className="text-base font-bold text-white leading-snug mt-1">
              {currentPlan.title}
            </h2>
            {currentPlan.subTitle && (
              <p className="text-xs text-slate-300 font-medium mt-0.5">{currentPlan.subTitle}</p>
            )}
          </div>
          <button
            onClick={onOpenWayfinderChat}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 text-sky-300 border border-sky-400/40 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
            title="Ask AI indoor wayfinder questions"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Ask AI</span>
          </button>
        </div>

        {/* Global Room & Purpose Search Input */}
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => {
              setGlobalSearch(e.target.value);
              setIsSearching(true);
            }}
            onFocus={() => setIsSearching(true)}
            placeholder="Search room number, lab, or purpose (e.g. 3101, Gear, SDC)..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />

          {/* Autocomplete Dropdown */}
          {isSearching && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bg-[#0d1629] border border-slate-700 rounded-xl shadow-2xl z-50 p-1 divide-y divide-slate-800">
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelectSearchResult(r)}
                  className="p-2 hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors text-left"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-white">{r.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold shrink-0">
                      L{r.floor || currentPlan.floorNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                    <span className="font-mono text-slate-300">{r.roomNumber ? `E5-${r.roomNumber}` : r.id}</span>
                    <span>·</span>
                    <span className="truncate max-w-[200px]">{r.purpose || r.category}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Origin and Destination Routing Inputs */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400">
          <span>INDOOR WAYPOINT ROUTE</span>
          <button
            onClick={onSwapPoints}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-sky-300 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-medium"
            title="Swap Origin and Destination"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Reverse</span>
          </button>
        </div>

        <div className="relative space-y-2">
          {/* Start Point Input */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30" />
            <div
              onClick={() => setIsSelectingOrigin((p) => !p)}
              className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded-xl text-xs text-white flex items-center justify-between cursor-pointer"
            >
              <div className="truncate">
                {selectedStartPOI ? (
                  <span className="font-semibold text-slate-100">
                    {selectedStartPOI.name} {selectedStartPOI.roomNumber ? `(${selectedStartPOI.roomNumber})` : ''} · L{selectedStartPOI.floor || currentPlan.floorNumber}
                  </span>
                ) : (
                  <span className="text-slate-500">Choose starting point...</span>
                )}
              </div>
            </div>

            {/* Origin Dropdown Picker */}
            {isSelectingOrigin && (
              <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[#0d1629] border border-slate-700 rounded-xl shadow-2xl z-40 p-1">
                <input
                  type="text"
                  value={originSearch}
                  onChange={(e) => setOriginSearch(e.target.value)}
                  placeholder="Filter origin rooms..."
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white mb-1"
                  autoFocus
                />
                {filteredOrigins.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      if (r.floor && r.floor !== currentPlan.floorNumber) {
                        const targetPlan = allPlans.find((p) => p.floorNumber === r.floor);
                        if (targetPlan) onSelectFloor(targetPlan);
                      }
                      onSelectStartPOI(r);
                      setIsSelectingOrigin(false);
                    }}
                    className="p-2 hover:bg-slate-800 rounded-lg cursor-pointer text-xs text-slate-200 flex items-center justify-between"
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="text-[10px] font-mono text-slate-400">L{r.floor || currentPlan.floorNumber}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Destination Input */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#ecc94b] ring-2 ring-yellow-500/30" />
            <div
              onClick={() => setIsSelectingDest((p) => !p)}
              className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded-xl text-xs text-white flex items-center justify-between cursor-pointer"
            >
              <div className="truncate">
                {selectedEndPOI ? (
                  <span className="font-semibold text-slate-100">
                    {selectedEndPOI.name} {selectedEndPOI.roomNumber ? `(${selectedEndPOI.roomNumber})` : ''} · L{selectedEndPOI.floor || currentPlan.floorNumber}
                  </span>
                ) : (
                  <span className="text-slate-500">Choose destination room...</span>
                )}
              </div>
            </div>

            {/* Destination Dropdown Picker */}
            {isSelectingDest && (
              <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[#0d1629] border border-slate-700 rounded-xl shadow-2xl z-40 p-1">
                <input
                  type="text"
                  value={destSearch}
                  onChange={(e) => setDestSearch(e.target.value)}
                  placeholder="Filter destination rooms..."
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white mb-1"
                  autoFocus
                />
                {filteredDests.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      if (r.floor && r.floor !== currentPlan.floorNumber) {
                        const targetPlan = allPlans.find((p) => p.floorNumber === r.floor);
                        if (targetPlan) onSelectFloor(targetPlan);
                      }
                      onSelectEndPOI(r);
                      onInspectRoom(r);
                      setIsSelectingDest(false);
                    }}
                    className="p-2 hover:bg-slate-800 rounded-lg cursor-pointer text-xs text-slate-200 flex items-center justify-between"
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="text-[10px] font-mono text-slate-400">L{r.floor || currentPlan.floorNumber}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Accessibility & Voice Toggles */}
        <div className="flex items-center justify-between pt-1 text-xs">
          <button
            onClick={onToggleAccessibleOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
              isAccessibleOnly
                ? 'bg-sky-500/15 border-sky-400/50 text-sky-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Accessibility className="w-3.5 h-3.5" />
            <span>Wheelchair Route</span>
          </button>

          <button
            onClick={onToggleVoice}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
              isVoiceActive
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {isVoiceActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>Voice Audio</span>
          </button>
        </div>
      </div>

      {/* Active Route Summary & Turn-by-Turn Guidance */}
      {route ? (
        <div className="flex-1 p-4 space-y-3.5">
          {/* Metrics Card */}
          <div className="p-3.5 rounded-2xl bg-[#0e162a] border border-slate-700/80 shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-black text-white tracking-tight">
                  {Math.ceil(route.estimatedWalkTimeMinutes)} min
                </span>
                <span className="text-xs text-slate-400 ml-2 font-mono">
                  ({route.totalDistanceMeters} meters)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggleSimulateWalk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                    isSimulatingWalk
                      ? 'bg-amber-400 text-slate-950 ring-2 ring-yellow-400/30'
                      : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  }`}
                >
                  {isSimulatingWalk ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isSimulatingWalk ? 'Pause Walk' : 'Walk Sim'}</span>
                </button>
              </div>
            </div>

            {/* Multi-floor transition indicator badge */}
            {route.fromFloor !== route.toFloor && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Multi-Floor Journey:</span>
                <span className="font-mono font-bold text-amber-300">
                  Level {route.fromFloor} ➔ Level {route.toFloor}
                </span>
              </div>
            )}

            {/* Caution Notes (e.g. E3 bridge verification warning) */}
            {route.flaggedNotes && route.flaggedNotes.length > 0 && (
              <div className="mt-2.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-[11px] text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-tight">{route.flaggedNotes[0]}</p>
              </div>
            )}
          </div>

          {/* Turn-by-Turn Steps List */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
              Step-by-Step Wayfinding ({route.steps.length} Steps)
            </div>
            <div className="space-y-2">
              {route.steps.map((step, idx) => {
                const isCurrent = idx === currentStepIndex;
                const isVertical = step.isVerticalTransition;

                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl border text-xs transition-all ${
                      isCurrent
                        ? 'bg-sky-500/15 border-sky-400/60 text-white shadow-sm ring-1 ring-sky-400/30'
                        : isVertical
                        ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shrink-0 mt-0.5 ${
                          isCurrent
                            ? 'bg-sky-400 text-slate-950'
                            : isVertical
                            ? 'bg-purple-400 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {step.stepNumber}
                      </div>
                      <div className="flex-1">
                        <p className="leading-snug">{step.instruction}</p>
                        {step.landmarkNote && (
                          <span className="text-[10px] text-sky-400 font-mono block mt-0.5">
                            {step.landmarkNote}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Empty State / Directory Quick Links */
        <div className="flex-1 p-4 space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
            <Footprints className="w-8 h-8 text-sky-400 mx-auto stroke-1" />
            <h4 className="text-sm font-bold text-white">Indoor A* Routing Ready</h4>
            <p className="text-xs text-slate-400">
              Select any start and destination room or click directly on the interactive floor plan to generate optimal walking paths.
            </p>
          </div>

          {/* Published Waterloo Facilities Quick Links */}
          {currentPlan.buildingId === 'uwaterloo-e5' && (
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-2">
                Verified Waterloo Facilities
              </span>
              <div className="space-y-1.5">
                {E5_FACILITIES.slice(0, 6).map((fac) => (
                  <div
                    key={fac.id}
                    onClick={() => {
                      const room = E5_ROOMS.find((r) => r.id === fac.mainRoomId);
                      if (room) {
                        if (room.floor !== currentPlan.floorNumber) {
                          const targetPlan = allPlans.find((p) => p.floorNumber === room.floor);
                          if (targetPlan) onSelectFloor(targetPlan);
                        }
                        onInspectRoom(room);
                        onSelectEndPOI(room);
                      }
                    }}
                    className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-200">{fac.name}</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Level {fac.primaryFloor} · Room {fac.mainRoomId.replace('e5-', '')}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
