import { useRef, useState } from 'react';
import type { Building, Floor, MapEdge, MapNode, Route } from '../lib/types';

export interface MapViewProps {
  building: Building;
  floor: Floor;
  route?: Route | null;
  blockedEdges: Set<string>;
  outShafts: Set<string>;
  fromId?: string;
  toId?: string;
  selectedNodeId?: string;
  pendingConnectId?: string;
  /** Current position during turn-by-turn navigation. */
  walkerNodeId?: string;
  showCorridorNodes?: boolean;
  draggable?: boolean;
  onNodeClick?: (node: MapNode) => void;
  onEdgeClick?: (edge: MapEdge) => void;
  onBackgroundClick?: (x: number, y: number) => void;
  onNodeDrag?: (nodeId: string, x: number, y: number) => void;
}

const PAD = 2;

export function MapView(props: MapViewProps) {
  const { building, floor, route, blockedEdges, outShafts } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const nodes = building.nodes.filter((n) => n.floorId === floor.id);
  const nodeById = new Map(building.nodes.map((n) => [n.id, n]));
  const walkways = building.edges.filter((e) => {
    if (e.kind !== 'walkway') return false;
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    return a?.floorId === floor.id && b?.floorId === floor.id;
  });

  const routeEdges = new Set(route?.edgeIds ?? []);
  const routeSegments: Array<[MapNode, MapNode]> = [];
  if (route) {
    for (let i = 0; i < route.edgeIds.length; i++) {
      const a = nodeById.get(route.nodeIds[i])!;
      const b = nodeById.get(route.nodeIds[i + 1])!;
      if (a.floorId === floor.id && b.floorId === floor.id) routeSegments.push([a, b]);
    }
  }

  const toSvg = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2];
  };

  const roomOf = new Map(floor.rooms.map((r) => [r.nodeId, r]));
  const markerR = Math.max(floor.width, floor.height) / 80;
  const fontSize = Math.max(floor.width, floor.height) / 55;

  return (
    <svg
      ref={svgRef}
      className={`map${floor.imageUrl ? ' has-image' : ''}`}
      viewBox={`${-PAD} ${-PAD} ${floor.width + PAD * 2} ${floor.height + PAD * 2}`}
      onPointerMove={(e) => {
        if (!dragging || !props.onNodeDrag) return;
        const p = toSvg(e.clientX, e.clientY);
        if (p) props.onNodeDrag(dragging, p[0], p[1]);
      }}
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
      onClick={(e) => {
        if (e.target !== e.currentTarget && !(e.target as Element).classList.contains('floor-bg')) return;
        const p = toSvg(e.clientX, e.clientY);
        if (p && props.onBackgroundClick) props.onBackgroundClick(p[0], p[1]);
      }}
      role="img"
      aria-label={`Map of ${floor.name}`}
    >
      <rect className="floor-bg" x={0} y={0} width={floor.width} height={floor.height} rx={0.5} />
      {floor.imageUrl && (
        <image className="floor-image floor-bg" href={floor.imageUrl} x={0} y={0} width={floor.width} height={floor.height} preserveAspectRatio="none" />
      )}

      {floor.rooms.map((r) => {
        const n = nodeById.get(r.nodeId);
        if (!n) return null;
        const cls = ['room', n.kind, n.id === props.toId ? 'dest' : '', n.id === props.selectedNodeId ? 'selected' : ''].join(' ');
        return (
          <polygon
            key={r.nodeId}
            className={cls}
            points={r.polygon.map((p) => p.join(',')).join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              props.onNodeClick?.(n);
            }}
          />
        );
      })}

      {walkways.map((e) => {
        const a = nodeById.get(e.from)!;
        const b = nodeById.get(e.to)!;
        const blocked = blockedEdges.has(e.id);
        return (
          <g key={e.id}>
            <line className={`walkway${blocked ? ' blocked' : ''}${routeEdges.has(e.id) ? ' on-route' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {props.onEdgeClick && (
              <line
                className="edge-hit"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                onClick={(ev) => {
                  ev.stopPropagation();
                  props.onEdgeClick!(e);
                }}
              >
                <title>{blocked ? 'Blocked corridor' : 'Corridor'}</title>
              </line>
            )}
          </g>
        );
      })}

      {routeSegments.length > 0 && (
        <g className="route">
          {routeSegments.map(([a, b], i) => (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          ))}
        </g>
      )}

      {nodes.map((n) => {
        const isOut = n.shaftId ? outShafts.has(n.shaftId) : false;
        const isSel = n.id === props.selectedNodeId || n.id === props.pendingConnectId;
        if (n.kind === 'corridor' && !props.showCorridorNodes && !isSel) return null;
        const hasShape = roomOf.has(n.id);
        return (
          <g
            key={n.id}
            className={`node ${n.kind}${isOut ? ' out' : ''}${isSel ? ' selected' : ''}`}
            transform={`translate(${n.x} ${n.y})`}
            onClick={(e) => {
              e.stopPropagation();
              props.onNodeClick?.(n);
            }}
            onPointerDown={(e) => {
              if (!props.draggable) return;
              e.stopPropagation();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragging(n.id);
            }}
            style={props.draggable ? { cursor: 'move' } : undefined}
          >
            {n.kind === 'corridor' ? (
              <circle r={markerR * 0.6} />
            ) : n.kind === 'stairs' || n.kind === 'elevator' ? (
              <>
                <rect x={-markerR} y={-markerR} width={markerR * 2} height={markerR * 2} rx={markerR * 0.3} />
                <text className="icon" fontSize={markerR * 1.3} dy="0.35em">
                  {n.kind === 'elevator' ? 'E' : 'S'}
                </text>
                {isOut && <line className="x" x1={-markerR} y1={-markerR} x2={markerR} y2={markerR} />}
              </>
            ) : hasShape ? (
              <circle r={markerR * 0.35} className="door" />
            ) : (
              <circle r={markerR * 0.8} />
            )}
            {n.kind !== 'corridor' && n.label && (
              <text className="label" fontSize={fontSize} y={n.kind === 'stairs' || n.kind === 'elevator' ? markerR * 2.2 : -markerR * 0.8}>
                {n.label.replace(/\s*\(Floor [^)]*\)$/, '')}
              </text>
            )}
          </g>
        );
      })}

      {(() => {
        const w = props.walkerNodeId ? nodeById.get(props.walkerNodeId) : undefined;
        if (!w || w.floorId !== floor.id) return null;
        return (
          <g className="walker" transform={`translate(${w.x} ${w.y})`} pointerEvents="none">
            <circle className="pulse" r={markerR * 2} />
            <circle r={markerR * 0.9} />
          </g>
        );
      })()}

      {[props.fromId, props.toId].map((id, i) => {
        const n = id ? nodeById.get(id) : undefined;
        if (!n || n.floorId !== floor.id) return null;
        return (
          <g key={i} className={`pin ${i === 0 ? 'from' : 'to'}`} transform={`translate(${n.x} ${n.y})`} pointerEvents="none">
            <circle r={markerR * 1.1} />
            <text fontSize={markerR * 1.2} dy="0.35em">
              {i === 0 ? 'A' : 'B'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
