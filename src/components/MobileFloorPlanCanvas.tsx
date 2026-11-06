import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { FloorPlanData, Point, RoomPOI, NavigationRoute } from '../types/navigation';
import { MAP_ASPECT_RATIO } from '../utils/pathfinding';

interface MobileFloorPlanCanvasProps {
  floorPlan: FloorPlanData;
  route: NavigationRoute | null;
  mode: 'explore' | 'search' | 'preview' | 'navigating';
  currentStepIndex: number;
  simulatedProgress: number; // 0 to 1
  onSelectRoom: (room: RoomPOI) => void;
  onOpenActionMenu: () => void;
}

export const MobileFloorPlanCanvas: React.FC<MobileFloorPlanCanvasProps> = ({
  floorPlan,
  route,
  mode,
  currentStepIndex,
  simulatedProgress,
  onSelectRoom,
  onOpenActionMenu,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Angle smoothing
  const smoothedAngleRef = useRef<number>(45);
  const lastAngleTimeRef = useRef<number>(performance.now());

  // Reset pan/zoom when floor plan changes
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [floorPlan.id]);

  // Touch & Mouse Pan Handlers
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
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(Math.max(0.7, prev * factor), 3));
  };

  // Filter visible waypoints for the current floor
  const activeWaypoints: Point[] = React.useMemo(() => {
    if (!route) return [];
    if (route.floorSegments && route.floorSegments.length > 0) {
      const seg = route.floorSegments.find((s) => s.floor === floorPlan.floorNumber);
      return seg ? seg.waypoints : [];
    }
    return route.waypoints || [];
  }, [route, floorPlan.floorNumber]);

  // Helper to smooth angle transition over ~150ms
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

  // Calculate live position of walker beacon along route using arc-length
  const getWalkerInfo = useCallback((): { point: Point; angleDeg: number } | null => {
    if (!route || activeWaypoints.length < 2) return null;

    if (mode === 'preview') {
      const p0 = activeWaypoints[0];
      const p1 = activeWaypoints[1];
      const dx = (p1.x - p0.x) * MAP_ASPECT_RATIO;
      const dy = p1.y - p0.y;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 45;
      return { point: p0, angleDeg: smoothAngle(angle) };
    }

    if (mode === 'navigating') {
      const currentDist = simulatedProgress * route.totalDistanceMeters;
      const legs = route.legs || [];
      const currentLeg =
        legs.find(
          (l) => currentDist >= l.startDistanceMeters && currentDist <= l.startDistanceMeters + l.distanceMeters
        ) || (currentDist >= route.totalDistanceMeters ? legs[legs.length - 1] : legs[0]);

      if (!currentLeg) return null;
      if (currentLeg.type === 'vertical') {
        if (floorPlan.floorNumber === currentLeg.floor) {
          return { point: currentLeg.waypoints[0], angleDeg: smoothedAngleRef.current };
        }
        if (currentLeg.toFloor && floorPlan.floorNumber === currentLeg.toFloor) {
          return { point: currentLeg.waypoints[1] || currentLeg.waypoints[0], angleDeg: smoothedAngleRef.current };
        }
        return null;
      }

      if (currentLeg.floor !== floorPlan.floorNumber) return null;

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
    }

    return null;
  }, [route, activeWaypoints, mode, simulatedProgress, floorPlan.floorNumber]);

  const walkerInfo = getWalkerInfo();

  // Walked path (faded 35%) vs remaining path (solid gold)
  const { walkedPathD, remainingPathD } = React.useMemo(() => {
    if (activeWaypoints.length < 2) return { walkedPathD: '', remainingPathD: '' };
    const toSvgPath = (pts: Point[]) =>
      pts.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');

    if (!route || mode !== 'navigating') {
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

    if (thisFloorLegIdx === -1) return { walkedPathD: '', remainingPathD: '' };
    if (activeLegIdx < thisFloorLegIdx) return { walkedPathD: '', remainingPathD: toSvgPath(activeWaypoints) };
    if (activeLegIdx > thisFloorLegIdx || simulatedProgress >= 1) return { walkedPathD: toSvgPath(activeWaypoints), remainingPathD: '' };

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

    return {
      walkedPathD: toSvgPath([...waypoints.slice(0, segIdx + 1), currPt]),
      remainingPathD: toSvgPath([currPt, ...waypoints.slice(segIdx + 1)]),
    };
  }, [activeWaypoints, route, mode, simulatedProgress, floorPlan.floorNumber]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="relative w-full h-full bg-[#e4eae4] overflow-hidden select-none cursor-grab active:cursor-grabbing touch-pan-map"
    >
      {/* Zoomable & Pannable Floor Plan Wrapper */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
        }}
        className="w-full h-full flex items-center justify-center p-2"
      >
        <div className="relative w-full max-w-[460px] aspect-[3067/992]">
          {/* Base Floor Plan SVG Image */}
          <img
            src={floorPlan.imageUrl}
            alt={floorPlan.title}
            className="w-full h-full object-contain pointer-events-none select-none"
            referrerPolicy="no-referrer"
          />

          {/* SVG Navigation Route Overlay */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          >
            {/* Bold Golden-Yellow Route Path with Dark Edges */}
            {(mode === 'preview' || mode === 'navigating') && route && activeWaypoints.length > 1 && (
              <g id="mobile-route-path">
                {/* Walked Path Segment (Faded to 35% Opacity) */}
                {walkedPathD && (
                  <g id="mobile-walked-route" opacity="0.35">
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
                  <g id="mobile-remaining-route">
                    <path
                      d={remainingPathD}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="7"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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

                {/* Start Point: Green Solid Circle */}
                <circle
                  cx={activeWaypoints[0].x}
                  cy={activeWaypoints[0].y}
                  r="4"
                  vectorEffect="non-scaling-stroke"
                  fill="#15803d"
                  stroke="#ffffff"
                  strokeWidth="2"
                />

                {/* Destination: Red Teardrop Map Pin */}
                {(() => {
                  const endPt = activeWaypoints[activeWaypoints.length - 1];
                  return (
                    <g transform={`translate(${endPt.x}, ${endPt.y})`}>
                      <path
                        d="M 0 0 C -1.6 -3.2 -3.2 -4.8 -3.2 -7 A 3.2 3.2 0 1 1 3.2 -7 C 3.2 -4.8 1.6 -3.2 0 0 Z"
                        fill="#ef4444"
                        stroke="#ffffff"
                        strokeWidth="0.5"
                      />
                      <circle cx="0" cy="-7" r="1.2" fill="#ffffff" />
                    </g>
                  );
                })()}

                {/* Live Walker Beacon */}
                {mode === 'navigating' && walkerInfo && (
                  <g transform={`translate(${walkerInfo.point.x}, ${walkerInfo.point.y})`}>
                    <circle r="4" fill="#ecc94b" fillOpacity="0.45" vectorEffect="non-scaling-stroke">
                      <animate attributeName="r" values="3;6;3" dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                    <circle r="3" fill="#1e293b" stroke="#ffffff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  </g>
                )}
              </g>
            )}
          </svg>

          {/* Clickable Invisible Hotspots for Floor Plan Rooms */}
          <div className="absolute inset-0 w-full h-full pointer-events-none">
            {floorPlan.rooms.map((room) => {
              const bounds = room.bounds || {
                x: room.coords.x - 10,
                y: room.coords.y - 10,
                width: 20,
                height: 20,
              };

              return (
                <div
                  key={room.id}
                  style={{
                    left: `${bounds.x}%`,
                    top: `${bounds.y}%`,
                    width: `${bounds.width}%`,
                    height: `${bounds.height}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRoom(room);
                  }}
                  className="absolute pointer-events-auto cursor-pointer rounded hover:bg-amber-400/10 transition-colors"
                  title={`Tap to navigate to ${room.name}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Amber Floating Action Button (FAB) on Bottom Right in Explore Mode (Screen 1) */}
      {mode === 'explore' && (
        <button
          onClick={onOpenActionMenu}
          className="absolute bottom-24 right-5 z-20 w-13 h-13 rounded-full bg-[#ecc94b] hover:bg-[#e2bd3a] text-slate-950 font-bold shadow-lg shadow-black/15 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="Scan, Upload or Add Destination"
          aria-label="Add or scan floor plan"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
};
