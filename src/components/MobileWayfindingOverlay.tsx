import React, { useState } from 'react';
import {
  Search,
  X,
  Navigation,
  Accessibility,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  Layers,
  Sparkles,
  Camera,
  MapPin,
  ArrowUpDown,
  ShieldCheck,
  AlertTriangle,
  Users,
  Footprints,
} from 'lucide-react';
import { FloorPlanData, RoomPOI, NavigationRoute } from '../types/navigation';
import { E5_ROOMS } from '../data/e5/e5DataLoader';

interface MobileWayfindingOverlayProps {
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
  onSelectFloorNumber: (floorNum: number) => void;
  onSelectStartPOI: (poi: RoomPOI | null) => void;
  onSelectEndPOI: (poi: RoomPOI | null) => void;
  onSwapPoints: () => void;
  onToggleSimulateWalk: () => void;
  onToggleAccessibleOnly: () => void;
  onToggleVoice: () => void;
  onOpenWayfinderChat: () => void;
  onOpenCamera: () => void;
  onInspectRoom: (room: RoomPOI) => void;
}

export const MobileWayfindingOverlay: React.FC<MobileWayfindingOverlayProps> = ({
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
  onSelectFloorNumber,
  onSelectStartPOI,
  onSelectEndPOI,
  onSwapPoints,
  onToggleSimulateWalk,
  onToggleAccessibleOnly,
  onToggleVoice,
  onOpenWayfinderChat,
  onOpenCamera,
  onInspectRoom,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  // Search pool across all E5 rooms or current plan
  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
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
      .slice(0, 10);
  }, [searchQuery, currentPlan]);

  const handleSelectRoom = (room: RoomPOI) => {
    // Automatically switch floor if on a different level
    if (room.floor && room.floor !== currentPlan.floorNumber) {
      onSelectFloorNumber(room.floor);
    }
    onInspectRoom(room);
    onSelectEndPOI(room);
    setSearchQuery('');
    setIsSearchActive(false);
  };

  const isE5 = currentPlan.buildingId === 'uwaterloo-e5' || currentPlan.id.startsWith('e5-');

  const floorLabels: Record<number, string> = {
    1: 'SDC & Shops',
    2: 'Gear Lab & Entrance',
    3: 'Classrooms & Bridge',
    4: 'ECE & Roof Garden',
    5: 'Dean of Engineering',
    6: 'Systems Design',
  };

  return (
    <div className="lg:hidden absolute inset-0 pointer-events-none z-30 flex flex-col justify-between">
      {/* Top Floating Area: Prominent Search Bar + Compact Floor Pills */}
      <div className="pt-2 px-3 pointer-events-auto space-y-2">
        {/* Prominent Search Bar Card */}
        <div className="relative">
          <div className="w-full bg-[#0c1324]/95 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-xl px-3.5 py-2.5 flex items-center gap-2.5">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchActive(true);
              }}
              onFocus={() => setIsSearchActive(true)}
              placeholder="Search E5 rooms, labs, or purpose (e.g. 3101, Gear)..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchActive(false);
                }}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onOpenWayfinderChat}
              className="p-1.5 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0"
              title="Ask AI"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Autocomplete Results Dropdown */}
          {isSearchActive && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-[#0d1629] border border-slate-700 rounded-2xl shadow-2xl z-50 p-1.5 divide-y divide-slate-800">
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelectRoom(r)}
                  className="p-2 hover:bg-slate-800 rounded-xl cursor-pointer text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate">{r.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold shrink-0 ml-1">
                      Level {r.floor || currentPlan.floorNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                    <span className="font-mono text-slate-300">{r.roomNumber ? `E5-${r.roomNumber}` : r.id}</span>
                    <span>·</span>
                    <span className="truncate max-w-[200px]">{r.purpose || r.category}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compact Floor Selection Pill Bar */}
        {isE5 && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {[1, 2, 3, 4, 5, 6].map((fNum) => {
              const isActive = currentPlan.floorNumber === fNum;
              const isOriginFloor = selectedStartPOI?.floor === fNum;
              const isDestFloor = selectedEndPOI?.floor === fNum;

              return (
                <button
                  key={fNum}
                  onClick={() => onSelectFloorNumber(fNum)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm transition-all shrink-0 ${
                    isActive
                      ? 'bg-[#ecc94b] text-slate-950 ring-2 ring-yellow-400/40 shadow-md scale-102'
                      : isDestFloor
                      ? 'bg-amber-950/80 border border-amber-500/60 text-amber-300'
                      : isOriginFloor
                      ? 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300'
                      : 'bg-[#0c1324]/90 backdrop-blur-md text-slate-300 border border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  <span>L{fNum}</span>
                  <span className="text-[9px] font-normal opacity-80 hidden xs:inline">
                    {floorLabels[fNum]?.split('&')[0].trim()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Floating Area: Collapsible Destination & Navigation Panel */}
      <div className="p-3 pointer-events-auto">
        <div className="w-full bg-[#0c1324]/95 backdrop-blur-2xl border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden transition-all duration-300">
          {/* Header Bar / Peek Handle */}
          <div
            onClick={() => setIsSheetExpanded((prev) => !prev)}
            className="px-4 py-2.5 flex items-center justify-between cursor-pointer border-b border-slate-800/80"
          >
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ecc94b]" />
              <div className="text-left">
                <span className="text-xs font-bold text-white block leading-tight">
                  {route ? route.toName : `Level ${currentPlan.floorNumber}: ${currentPlan.subTitle || currentPlan.title}`}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {route
                    ? `${Math.ceil(route.estimatedWalkTimeMinutes)} min · ${route.totalDistanceMeters}m walk`
                    : 'Tap to view navigation & route options'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {route && !isSheetExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSimulateWalk();
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm ${
                    isSimulatingWalk
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-emerald-500 text-slate-950'
                  }`}
                >
                  {isSimulatingWalk ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                  <span>{isSimulatingWalk ? 'Pause' : 'Walk'}</span>
                </button>
              )}
              <div className="p-1 text-slate-400">
                {isSheetExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </div>
            </div>
          </div>

          {/* Expanded Drawer Content */}
          {isSheetExpanded && (
            <div className="p-4 space-y-3.5 max-h-[60vh] overflow-y-auto">
              {/* Origin / Destination Pickers */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>ROUTE WAYPOINTS</span>
                  <button
                    onClick={onSwapPoints}
                    className="flex items-center gap-1 text-sky-400 hover:text-sky-300"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>Swap</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate text-slate-200">
                    {selectedStartPOI ? `${selectedStartPOI.name} (L${selectedStartPOI.floor || currentPlan.floorNumber})` : 'Choose origin...'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ecc94b] shrink-0" />
                  <span className="truncate text-slate-200">
                    {selectedEndPOI ? `${selectedEndPOI.name} (L${selectedEndPOI.floor || currentPlan.floorNumber})` : 'Choose destination...'}
                  </span>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  onClick={onToggleAccessibleOnly}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
                    isAccessibleOnly
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <Accessibility className="w-3.5 h-3.5" />
                  <span>Wheelchair Route</span>
                </button>

                <button
                  onClick={onToggleVoice}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
                    isVoiceActive
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {isVoiceActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>Voice Audio</span>
                </button>
              </div>

              {/* Turn-by-Turn Steps */}
              {route && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>DIRECTIONS ({route.steps.length} STEPS)</span>
                    <button
                      onClick={onToggleSimulateWalk}
                      className="text-amber-400 font-bold flex items-center gap-1"
                    >
                      {isSimulatingWalk ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                      <span>{isSimulatingWalk ? 'Pause Simulation' : 'Start Walk Simulation'}</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {route.steps.map((step, idx) => {
                      const isCurrent = idx === currentStepIndex;
                      const isVertical = step.isVerticalTransition;

                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded-xl text-xs border ${
                            isCurrent
                              ? 'bg-sky-500/15 border-sky-400 text-white font-medium shadow-sm'
                              : isVertical
                              ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                              : 'bg-slate-900/60 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="font-mono text-[10px] opacity-60 mt-0.5">{step.stepNumber}.</span>
                            <span className="leading-snug">{step.instruction}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
