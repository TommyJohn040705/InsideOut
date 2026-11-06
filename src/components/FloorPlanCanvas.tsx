import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Navigation,
  Compass,
  Footprints,
  Eye,
  EyeOff,
  Layers,
  FileImage,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Edit3,
  ExternalLink,
  Building,
  RotateCcw,
} from 'lucide-react';
import { FloorPlanData, Point, RoomPOI, NavigationRoute, POICategory } from '../types/navigation';
import { MAP_ASPECT_RATIO } from '../utils/pathfinding';

interface FloorPlanCanvasProps {
  floorPlan: FloorPlanData;
  route: NavigationRoute | null;
  selectedStartPOI: RoomPOI | null;
  selectedEndPOI: RoomPOI | null;
  customStartPoint: Point | null;
  customEndPoint: Point | null;
  currentStepIndex: number;
  isNavigating: boolean;
  isSimulatingWalk: boolean;
  simulatedProgress: number; // 0 to 1
  activeInspectedRoom: RoomPOI | null;
  isEditingMode?: boolean;
  onSelectStartPOI: (poi: RoomPOI) => void;
  onSelectEndPOI: (poi: RoomPOI) => void;
  onSetCustomStart: (pt: Point) => void;
  onSetCustomEnd: (pt: Point) => void;
  onInspectRoom: (room: RoomPOI) => void;
  onUpdateRoomCoords?: (roomId: string, coords: Point) => void;
}

export const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({
  floorPlan,
  route,
  selectedStartPOI,
  selectedEndPOI,
  customStartPoint,
  customEndPoint,
  currentStepIndex,
  isNavigating,
  isSimulatingWalk,
  simulatedProgress,
  activeInspectedRoom,
  isEditingMode = false,
  onSelectStartPOI,
  onSelectEndPOI,
  onSetCustomStart,
  onSetCustomEnd,
  onInspectRoom,
  onUpdateRoomCoords,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan and Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Visual toggles
  const [showPOILabels, setShowPOILabels] = useState(true);
  const [showCorridorGrid, setShowCorridorGrid] = useState(false);
  const [showOriginalDrawing, setShowOriginalDrawing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [hoveredRoom, setHoveredRoom] = useState<RoomPOI | null>(null);

  // Heading rotation smoothing refs
  const smoothedAngleRef = useRef<number>(45);
  const lastAngleTimeRef = useRef<number>(performance.now());

  // Reset view when floor plan changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [floorPlan.id]);

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(Math.max(0.6, prev + delta), 4.5));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    setZoom((prev) => Math.min(Math.max(0.6, prev * zoomFactor), 4.5));
  };

  // Canvas Click: in editing mode, moves the inspected room; otherwise drops start/dest
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.poi-interactive-node')) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const clickX = e.clientX - rect.left - pan.x;
    const clickY = e.clientY - rect.top - pan.y;

    const width = rect.width * zoom;
    const height = rect.height * zoom;

    const pctX = Math.min(Math.max(0, (clickX / width) * 100), 100);
    const pctY = Math.min(Math.max(0, (clickY / height) * 100), 100);

    const clickPt = { x: Math.round(pctX * 10) / 10, y: Math.round(pctY * 10) / 10 };

    if (isEditingMode && activeInspectedRoom && onUpdateRoomCoords) {
      onUpdateRoomCoords(activeInspectedRoom.id, clickPt);
    }
  };

  // Filter visible waypoints for the current floor
  const activeWaypoints: Point[] = React.useMemo(() => {
    if (!route) return [];
    if (route.floorSegments && route.floorSegments.length > 0) {
      const seg = route.floorSegments.find((s) => s.floor === floorPlan.floorNumber);
      return seg ? seg.waypoints : [];
    }
    // single floor fallback
    if (route.activeFloor === floorPlan.floorNumber || !route.fromFloor) {
      return route.waypoints;
    }
    return [];
  }, [route, floorPlan.floorNumber]);

  /**
   * Helper to smooth angle transition over ~150ms taking shortest rotational direction
   */
  const smoothAngle = (targetDeg: number): number => {
    const now = performance.now();
    const dt = Math.min(now - lastAngleTimeRef.current, 100);
    lastAngleTimeRef.current = now;

    let diff = targetDeg - smoothedAngleRef.current;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    const factor = dt <= 0 ? 1 : Math.min(1, dt / 150);
    smoothedAngleRef.current += diff * factor;
    return smoothedAngleRef.current;
  };

  // Calculate live position of walker beacon along the active floor route using arc-length
  const getWalkerInfo = useCallback((): { point: Point; angleDeg: number } | null => {
    if (!route || activeWaypoints.length < 2) return null;

    if (!isSimulatingWalk) {
      const currentStep = route.steps[currentStepIndex];
      if (isNavigating && currentStep && currentStep.floor === floorPlan.floorNumber) {
        const pt = currentStep.coords;
        const nextPt = route.steps[currentStepIndex + 1]?.coords || pt;
        const dx = (nextPt.x - pt.x) * MAP_ASPECT_RATIO;
        const dy = nextPt.y - pt.y;
        let targetAngle = smoothedAngleRef.current;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 45;
        }
        return { point: pt, angleDeg: smoothAngle(targetAngle) };
      }
      const p0 = activeWaypoints[0];
      const p1 = activeWaypoints[1];
      const dx = (p1.x - p0.x) * MAP_ASPECT_RATIO;
      const dy = p1.y - p0.y;
      const targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 45;
      return { point: p0, angleDeg: smoothAngle(targetAngle) };
    }

    const currentDist = simulatedProgress * route.totalDistanceMeters;
    const legs = route.legs || [];

    // Find current active leg
    const currentLeg =
      legs.find(
        (l) => currentDist >= l.startDistanceMeters && currentDist <= l.startDistanceMeters + l.distanceMeters
      ) || (currentDist >= route.totalDistanceMeters ? legs[legs.length - 1] : legs[0]);

    if (!currentLeg) return null;

    // If active leg is vertical elevator transition
    if (currentLeg.type === 'vertical') {
      if (floorPlan.floorNumber === currentLeg.floor) {
        return { point: currentLeg.waypoints[0], angleDeg: smoothedAngleRef.current };
      }
      if (currentLeg.toFloor && floorPlan.floorNumber === currentLeg.toFloor) {
        return { point: currentLeg.waypoints[1] || currentLeg.waypoints[0], angleDeg: smoothedAngleRef.current };
      }
      return null;
    }

    // If active leg is floor leg on another floor: hide walker on viewed floor
    if (currentLeg.floor !== floorPlan.floorNumber) {
      return null;
    }

    // Active leg is on currently viewed floor: calculate constant speed arc-length position
    const legDist = Math.max(0, Math.min(currentLeg.distanceMeters, currentDist - currentLeg.startDistanceMeters));
    const cum = currentLeg.cumulativeSegmentDistances || [0];
    const waypoints = currentLeg.waypoints;
    if (waypoints.length < 2) return null;

    let segIdx = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dStart = cum[i] ?? 0;
      const dEnd = cum[i + 1] ?? cum[i];
      if (legDist >= dStart && (legDist <= dEnd || i === waypoints.length - 2)) {
        segIdx = i;
        break;
      }
    }

    const p1 = waypoints[segIdx];
    const p2 = waypoints[segIdx + 1];
    const segStartDist = cum[segIdx] ?? 0;
    const segEndDist = cum[segIdx + 1] ?? segStartDist;
    const segLen = Math.max(0.0001, segEndDist - segStartDist);
    const t = Math.max(0, Math.min(1, (legDist - segStartDist) / segLen));

    const pt: Point = {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };

    const dx = (p2.x - p1.x) * MAP_ASPECT_RATIO;
    const dy = p2.y - p1.y;
    const rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const targetAngle = rawAngle + 45;

    return {
      point: pt,
      angleDeg: smoothAngle(targetAngle),
    };
  }, [route, activeWaypoints, isSimulatingWalk, simulatedProgress, isNavigating, currentStepIndex, floorPlan.floorNumber]);

  const walkerInfo = getWalkerInfo();

  // Precompute walked path (35% opacity) and remaining path (solid gold)
  const { walkedPathD, remainingPathD } = React.useMemo(() => {
    if (activeWaypoints.length < 2) return { walkedPathD: '', remainingPathD: '' };

    const toSvgPath = (pts: Point[]) =>
      pts.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');

    if (!route || (!isSimulatingWalk && !isNavigating)) {
      return { walkedPathD: '', remainingPathD: toSvgPath(activeWaypoints) };
    }

    const currentDist = simulatedProgress * route.totalDistanceMeters;
    const legs = route.legs || [];
    const currentLegIndex = legs.findIndex(
      (l) => currentDist >= l.startDistanceMeters && currentDist <= l.startDistanceMeters + l.distanceMeters
    );
    const activeLegIdx =
      currentLegIndex !== -1 ? currentLegIndex : currentDist >= route.totalDistanceMeters ? legs.length - 1 : 0;
    const thisFloorLegIdx = legs.findIndex((l) => l.type === 'floor' && l.floor === floorPlan.floorNumber);

    if (thisFloorLegIdx === -1) {
      return { walkedPathD: '', remainingPathD: '' };
    }

    // If walker has not reached this floor yet
    if (activeLegIdx < thisFloorLegIdx) {
      return { walkedPathD: '', remainingPathD: toSvgPath(activeWaypoints) };
    }

    // If walker has finished this floor
    if (activeLegIdx > thisFloorLegIdx || simulatedProgress >= 1) {
      return { walkedPathD: toSvgPath(activeWaypoints), remainingPathD: '' };
    }

    // Walker is currently walking on this floor
    const leg = legs[thisFloorLegIdx];
    const legDist = Math.max(0, Math.min(leg.distanceMeters, currentDist - leg.startDistanceMeters));
    const cum = leg.cumulativeSegmentDistances || [0];
    const waypoints = leg.waypoints;

    let segIdx = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dStart = cum[i] ?? 0;
      const dEnd = cum[i + 1] ?? cum[i];
      if (legDist >= dStart && (legDist <= dEnd || i === waypoints.length - 2)) {
        segIdx = i;
        break;
      }
    }

    const p1 = waypoints[segIdx];
    const p2 = waypoints[segIdx + 1];
    const segStartDist = cum[segIdx] ?? 0;
    const segEndDist = cum[segIdx + 1] ?? segStartDist;
    const segLen = Math.max(0.0001, segEndDist - segStartDist);
    const t = Math.max(0, Math.min(1, (legDist - segStartDist) / segLen));

    const currPt: Point = {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };

    const walkedPoints = [...waypoints.slice(0, segIdx + 1), currPt];
    const remainingPoints = [currPt, ...waypoints.slice(segIdx + 1)];

    return {
      walkedPathD: toSvgPath(walkedPoints),
      remainingPathD: toSvgPath(remainingPoints),
    };
  }, [activeWaypoints, route, isSimulatingWalk, isNavigating, simulatedProgress, floorPlan.floorNumber]);

  // Filtered rooms
  const visibleRooms = floorPlan.rooms.filter((room) => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'classroom') return room.category === 'classroom' || room.category === 'conference';
    if (categoryFilter === 'workshop') return room.category === 'workshop' || room.category === 'lab';
    if (categoryFilter === 'restroom') return room.category === 'restroom';
    if (categoryFilter === 'vertical') return room.category === 'elevator' || room.category === 'stairs';
    if (categoryFilter === 'entrances') return room.category === 'entrance' || room.category === 'exit' || room.category === 'bridge';
    if (categoryFilter === 'verified') return room.purposeVerification === 'verified_official_source';
    return true;
  });

  const getCategoryTheme = (category: POICategory) => {
    switch (category) {
      case 'classroom':
        return { color: '#f59e0b', ring: 'ring-amber-400', bg: 'bg-amber-500' };
      case 'workshop':
      case 'lab':
        return { color: '#10b981', ring: 'ring-emerald-400', bg: 'bg-emerald-500' };
      case 'restroom':
        return { color: '#38bdf8', ring: 'ring-sky-400', bg: 'bg-sky-500' };
      case 'elevator':
      case 'stairs':
        return { color: '#a855f7', ring: 'ring-purple-400', bg: 'bg-purple-500' };
      case 'entrance':
      case 'bridge':
        return { color: '#06b6d4', ring: 'ring-cyan-400', bg: 'bg-cyan-500' };
      case 'office':
        return { color: '#6366f1', ring: 'ring-indigo-400', bg: 'bg-indigo-500' };
      case 'study':
      case 'dining':
        return { color: '#eab308', ring: 'ring-yellow-400', bg: 'bg-yellow-500' };
      default:
        return { color: '#64748b', ring: 'ring-slate-400', bg: 'bg-slate-500' };
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#070b14] overflow-hidden select-none">
      {/* Studio Glass Filter Floating Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none gap-2">
        <div className="flex items-center gap-1.5 p-1 bg-[#0c1322]/90 backdrop-blur-xl rounded-2xl border border-slate-800/80 shadow-2xl pointer-events-auto overflow-x-auto max-w-[calc(100%-160px)]">
          {[
            { id: 'all', label: `All Rooms (${floorPlan.rooms.length})` },
            { id: 'classroom', label: 'Classrooms' },
            { id: 'workshop', label: 'Labs & Workshops' },
            { id: 'restroom', label: 'Washrooms' },
            { id: 'vertical', label: 'Elevators & Stairs' },
            { id: 'entrances', label: 'Entrances & Bridges' },
            { id: 'verified', label: '⭐ Verified Purpose' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 ${
                categoryFilter === cat.id
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* View & Layer Controls */}
        <div className="flex items-center gap-1 p-1 bg-[#0c1322]/90 backdrop-blur-xl rounded-2xl border border-slate-800/80 shadow-2xl pointer-events-auto">
          <button
            onClick={() => setShowPOILabels((p) => !p)}
            className={`p-2 rounded-xl text-xs font-medium transition-colors ${
              showPOILabels ? 'text-sky-300 bg-sky-950/70 border border-sky-800/50' : 'text-slate-400 hover:text-white'
            }`}
            title={showPOILabels ? 'Hide Room Labels' : 'Show Room Labels'}
          >
            {showPOILabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowCorridorGrid((p) => !p)}
            className={`p-2 rounded-xl text-xs font-medium transition-colors ${
              showCorridorGrid ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-800/50' : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle Walkable Hallway Graph"
          >
            <Layers className="w-4 h-4" />
          </button>
          {floorPlan.originalImageUrl && (
            <button
              onClick={() => setShowOriginalDrawing((p) => !p)}
              className={`p-2 rounded-xl text-xs font-medium transition-colors ${
                showOriginalDrawing ? 'text-amber-300 bg-amber-950/70 border border-amber-800/50' : 'text-slate-400 hover:text-white'
              }`}
              title={showOriginalDrawing ? 'Show Clean Map' : 'Show Original Drawing'}
            >
              <FileImage className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Map Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        className={`relative w-full h-full flex items-center justify-center overflow-hidden ${
          isEditingMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
          className="relative w-full max-w-[1340px] aspect-[3067/992] rounded-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.95)] border border-slate-800/90 bg-[#f4f7f4]"
        >
          {/* Base Architectural Floor Plan Image */}
          <img
            src={showOriginalDrawing && floorPlan.originalImageUrl ? floorPlan.originalImageUrl : floorPlan.imageUrl}
            alt={floorPlan.title}
            className="w-full h-full object-fill pointer-events-none select-none"
            referrerPolicy="no-referrer"
          />

          {/* SVG Navigation Route & Walkable Graph Overlay */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          >
            {/* Walkable Hallway Corridor Graph (when toggled) */}
            {showCorridorGrid &&
              floorPlan.hallways.map((node) => (
                <g key={node.id}>
                  {node.connectedTo.map((targetId) => {
                    const targetNode = floorPlan.hallways.find((h) => h.id === targetId);
                    if (!targetNode) return null;
                    return (
                      <line
                        key={`${node.id}-${targetId}`}
                        x1={node.coords.x}
                        y1={node.coords.y}
                        x2={targetNode.coords.x}
                        y2={targetNode.coords.y}
                        stroke="#0ea5e9"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray="4 4"
                        opacity="0.6"
                      />
                    );
                  })}
                  <path
                    d={`M ${node.coords.x} ${node.coords.y} l 0 0`}
                    stroke="#0ea5e9"
                    strokeWidth="6"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity="0.8"
                  />
                </g>
              ))}

            {/* Turn-by-Turn Route Path Overlay */}
            {activeWaypoints.length > 1 && (
              <g id="route-path-group">
                {/* Walked Path Segment (Faded to 35% Opacity) */}
                {walkedPathD && (
                  <g id="walked-route-path" opacity="0.35">
                    <path
                      d={walkedPathD}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="7"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={walkedPathD}
                      fill="none"
                      stroke="#ecc94b"
                      strokeWidth="4"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {/* Remaining Path Segment (Solid Vibrant Gold) */}
                {remainingPathD && (
                  <g id="remaining-route-path">
                    {/* Dark Outline Stroke (7px non-scaling) */}
                    <path
                      d={remainingPathD}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="7"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Vibrant Gold Core Stroke (4px non-scaling) */}
                    <path
                      d={remainingPathD}
                      fill="none"
                      stroke="#ecc94b"
                      strokeWidth="4"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
              </g>
            )}

            {/* Waypoint Nodes along route */}
            {activeWaypoints.map((pt, idx) => {
              if (idx === 0 || idx === activeWaypoints.length - 1) return null;
              return (
                <g key={`wp-${idx}`}>
                  <path d={`M ${pt.x} ${pt.y} l 0 0`} stroke="#0f172a" strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={`M ${pt.x} ${pt.y} l 0 0`} stroke="#ffffff" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>

          {/* Interactive Room POI Markers */}
          <div className="absolute inset-0 w-full h-full pointer-events-none z-20">
            {visibleRooms.map((room) => {
              const theme = getCategoryTheme(room.category);
              const isSelectedStart = selectedStartPOI?.id === room.id;
              const isSelectedEnd = selectedEndPOI?.id === room.id;
              const isInspected = activeInspectedRoom?.id === room.id;
              const isVerified = room.purposeVerification === 'verified_official_source';

              return (
                <div
                  key={room.id}
                  style={{ left: `${room.coords.x}%`, top: `${room.coords.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto poi-interactive-node group cursor-pointer"
                  onClick={() => onInspectRoom(room)}
                  onMouseEnter={() => setHoveredRoom(room)}
                  onMouseLeave={() => setHoveredRoom(null)}
                >
                  {/* Origin Beacon */}
                  {isSelectedStart && (
                    <div className="absolute -inset-2.5 rounded-full bg-emerald-500/30 animate-ping pointer-events-none" />
                  )}

                  {/* Destination Beacon */}
                  {isSelectedEnd && (
                    <div className="absolute -inset-3.5 rounded-full bg-amber-400/40 animate-ping pointer-events-none" />
                  )}

                  {/* Node Pin Marker */}
                  <div
                    className={`relative rounded-full transition-all flex items-center justify-center shadow-md ${
                      isSelectedStart
                        ? 'w-6 h-6 bg-emerald-500 text-slate-950 ring-4 ring-emerald-400/50 scale-125 z-30'
                        : isSelectedEnd
                        ? 'w-6 h-6 bg-[#ecc94b] text-slate-950 ring-4 ring-yellow-400/50 scale-125 z-30'
                        : isInspected
                        ? 'w-5 h-5 bg-sky-400 text-slate-950 ring-2 ring-sky-300 scale-115 z-25'
                        : 'w-3.5 h-3.5 border border-slate-900/60 hover:scale-135 hover:z-25'
                    }`}
                    style={{
                      backgroundColor:
                        isSelectedStart ? '#10b981' : isSelectedEnd ? '#ecc94b' : isInspected ? '#38bdf8' : theme.color,
                    }}
                  >
                    {isVerified && !isSelectedStart && !isSelectedEnd && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                    )}
                    {(isSelectedStart || isSelectedEnd) && (
                      <MapPin className="w-3.5 h-3.5 fill-current" />
                    )}
                  </div>

                  {/* Room Label Pill */}
                  {showPOILabels && (
                    <div
                      className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold whitespace-nowrap transition-all shadow-sm border ${
                        isSelectedStart
                          ? 'bg-emerald-950 text-emerald-200 border-emerald-500/80 z-30'
                          : isSelectedEnd
                          ? 'bg-amber-950 text-amber-200 border-yellow-500/80 z-30'
                          : isInspected
                          ? 'bg-sky-950 text-sky-200 border-sky-500/80 z-25'
                          : 'bg-slate-950/85 text-slate-200 border-slate-800 hover:bg-slate-900 z-10'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {isVerified && <span className="text-emerald-400">●</span>}
                        <span>{room.roomNumber || room.name.slice(0, 14)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Walking Beacon */}
            {walkerInfo && (
              <div
                style={{
                  left: `${walkerInfo.point.x}%`,
                  top: `${walkerInfo.point.y}%`,
                  transform: `translate(-50%, -50%)`,
                }}
                className="absolute z-40 pointer-events-none"
              >
                <div className="relative flex items-center justify-center">
                  <div className="absolute -inset-3 rounded-full bg-sky-400/40 animate-ping" />
                  <div
                    style={{ transform: `rotate(${walkerInfo.angleDeg}deg)` }}
                    className="w-7 h-7 rounded-full bg-sky-500 border-2 border-white text-slate-950 shadow-xl flex items-center justify-center"
                  >
                    <Navigation className="w-4 h-4 fill-current stroke-[2.2]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Canvas Action Controls (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5 p-1.5 bg-[#0c1322]/90 backdrop-blur-xl rounded-2xl border border-slate-800 shadow-2xl">
        <button
          onClick={() => handleZoom(0.25)}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleZoom(-0.25)}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors"
          title="Reset Zoom & Pan"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Editing Mode Banner */}
      {isEditingMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-amber-500/20 border border-amber-500/50 backdrop-blur-xl shadow-xl flex items-center gap-2 text-amber-200 text-xs font-semibold animate-pulse">
          <Edit3 className="w-4 h-4 text-amber-400" />
          <span>Floor Plan Editing Mode: Click anywhere on canvas to reposition selected room.</span>
        </div>
      )}
    </div>
  );
};
