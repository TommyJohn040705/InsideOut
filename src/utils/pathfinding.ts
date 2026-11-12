import {
  Point,
  FloorPlanData,
  NavigationRoute,
  NavigationStep,
  ManeuverAction,
  RoomPOI,
  VerticalCirculationLink,
  RouteLeg,
} from '../types/navigation';
import { E5_VERTICAL_LINKS } from '../data/e5/e5DataLoader';

// Cropped E5 floor plan frame: 3067 x 992 px
export const MAP_ASPECT_RATIO = 3067 / 992; // ~1.5454545

/**
 * Aspect-corrected Euclidean distance between two percentage coordinates
 */
export function aspectDistance(p1: Point, p2: Point): number {
  const dx = (p2.x - p1.x) * MAP_ASPECT_RATIO;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Convert aspect-corrected percentage distance into estimated meters
 * E5 drawings are 1:300; the cropped map (3067x992 px, ~29.2 px per metre) is ~34 m tall,
 * so 1% of map height ~= 0.34 m (map width ~105 m).
 */
export function pctToMeters(pctDist: number, buildingType: string = ''): number {
  let scaleMetersPerPct = 0.34;
  if (buildingType.toLowerCase().includes('engineering')) {
    scaleMetersPerPct = 0.34;
  } else if (buildingType.toLowerCase().includes('airport')) {
    scaleMetersPerPct = 1.4;
  } else if (buildingType.toLowerCase().includes('hospital')) {
    scaleMetersPerPct = 0.9;
  }
  return Math.max(1, Math.round(pctDist * scaleMetersPerPct * 10) / 10);
}

/**
 * Determine turn angle between 3 points in real pixel space: A -> B -> C
 */
function calculateTurnAction(a: Point, b: Point, c: Point): ManeuverAction {
  const v1x = (b.x - a.x) * MAP_ASPECT_RATIO;
  const v1y = b.y - a.y;
  const v2x = (c.x - b.x) * MAP_ASPECT_RATIO;
  const v2y = c.y - b.y;

  const angle1 = Math.atan2(v1y, v1x);
  const angle2 = Math.atan2(v2y, v2x);

  let diff = angle2 - angle1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  const deg = (diff * 180) / Math.PI;

  if (Math.abs(deg) < 22) return 'straight';
  if (deg >= 22 && deg < 65) return 'slight-right';
  if (deg >= 65) return 'turn-right';
  if (deg <= -22 && deg > -65) return 'slight-left';
  return 'turn-left';
}

interface GraphNode {
  id: string;
  coords: Point;
  neighbors: { id: string; weight: number }[];
}

/**
 * A* Pathfinding for a single floor using aspect-corrected weights
 */
function findPathOnSingleFloor(
  floorPlan: FloorPlanData,
  startPoint: Point,
  endPoint: Point,
  startRoomId?: string,
  endRoomId?: string
): Point[] {
  return findPathCore(floorPlan, startPoint, endPoint, startRoomId, endRoomId) ?? [startPoint, endPoint];
}

/** Nodes and vertical links closed by confirmed reports (see utils/reports.ts routeClosures). */
export interface RouteClosures {
  nodeIds: Set<string>;
  linkIds: Set<string>;
  /** Links with a report nobody has confirmed yet: warned about, not avoided. */
  unconfirmedLinkIds: Set<string>;
}

/** Path that avoids closed nodes. If no such path exists it says so and routes through the closure. */
function findPathAvoiding(
  floorPlan: FloorPlanData,
  startPoint: Point,
  endPoint: Point,
  startRoomId: string | undefined,
  endRoomId: string | undefined,
  closures: RouteClosures | undefined,
  notes: string[]
): Point[] {
  if (closures?.nodeIds.size) {
    const open = findPathCore(floorPlan, startPoint, endPoint, startRoomId, endRoomId, closures.nodeIds);
    if (open) {
      const direct = findPathCore(floorPlan, startPoint, endPoint, startRoomId, endRoomId);
      if (direct && direct.length !== open.length) notes.unshift(`Rerouted on Level ${floorPlan.floorNumber} around a hallway reported closed.`);
      return open;
    }
    notes.unshift(`A hallway on Level ${floorPlan.floorNumber} is reported closed and no other way around it is mapped. This route passes through it.`);
  }
  return findPathOnSingleFloor(floorPlan, startPoint, endPoint, startRoomId, endRoomId);
}

/** Returns null when the two points are not connected. */
function findPathCore(
  floorPlan: FloorPlanData,
  startPoint: Point,
  endPoint: Point,
  startRoomId?: string,
  endRoomId?: string,
  blocked?: Set<string>
): Point[] | null {
  const nodes = new Map<string, GraphNode>();

  // Add all hallway nodes
  for (const h of floorPlan.hallways) {
    nodes.set(h.id, {
      id: h.id,
      coords: h.coords,
      neighbors: [],
    });
  }

  // Add all room POIs
  for (const r of floorPlan.rooms) {
    nodes.set(r.id, {
      id: r.id,
      coords: r.coords,
      neighbors: [],
    });
  }

  // Connect hallway nodes based on connectedTo
  for (const h of floorPlan.hallways) {
    const node = nodes.get(h.id);
    if (!node) continue;

    for (const targetId of h.connectedTo) {
      const targetNode = nodes.get(targetId);
      if (targetNode) {
        const dist = aspectDistance(node.coords, targetNode.coords);
        if (!node.neighbors.some((n) => n.id === targetId)) {
          node.neighbors.push({ id: targetId, weight: dist });
        }
        if (!targetNode.neighbors.some((n) => n.id === h.id)) {
          targetNode.neighbors.push({ id: h.id, weight: dist });
        }
      }
    }
  }

  const startId = startRoomId || 'virtual-start';
  const endId = endRoomId || 'virtual-end';

  if (!nodes.has(startId)) {
    nodes.set(startId, {
      id: startId,
      coords: startPoint,
      neighbors: [],
    });
  }

  if (!nodes.has(endId)) {
    nodes.set(endId, {
      id: endId,
      coords: endPoint,
      neighbors: [],
    });
  }

  // Connect start node to closest hallway node if not already connected
  const startNode = nodes.get(startId)!;
  if (startNode.neighbors.length === 0) {
    let bestH: GraphNode | null = null;
    let minD = Infinity;
    for (const h of floorPlan.hallways) {
      const d = aspectDistance(startPoint, h.coords);
      if (d < minD) {
        minD = d;
        bestH = nodes.get(h.id) || null;
      }
    }
    if (bestH) {
      startNode.neighbors.push({ id: bestH.id, weight: minD });
      bestH.neighbors.push({ id: startId, weight: minD });
    }
  }

  // Connect end node to closest hallway node if not already connected
  const endNode = nodes.get(endId)!;
  if (endNode.neighbors.length === 0) {
    let bestH: GraphNode | null = null;
    let minD = Infinity;
    for (const h of floorPlan.hallways) {
      const d = aspectDistance(endPoint, h.coords);
      if (d < minD) {
        minD = d;
        bestH = nodes.get(h.id) || null;
      }
    }
    if (bestH) {
      endNode.neighbors.push({ id: bestH.id, weight: minD });
      bestH.neighbors.push({ id: endId, weight: minD });
    }
  }

  // Dijkstra / A*
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (const [id] of nodes) {
    distances.set(id, Infinity);
    previous.set(id, null);
    unvisited.add(id);
  }

  distances.set(startId, 0);

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let shortest = Infinity;

    for (const id of unvisited) {
      const dist = distances.get(id)!;
      if (dist < shortest) {
        shortest = dist;
        currentId = id;
      }
    }

    if (!currentId || shortest === Infinity || currentId === endId) {
      break;
    }

    unvisited.delete(currentId);
    const currentNode = nodes.get(currentId)!;

    for (const neighbor of currentNode.neighbors) {
      if (!unvisited.has(neighbor.id)) continue;
      if (blocked?.has(neighbor.id) && neighbor.id !== endId) continue;

      const alt = shortest + neighbor.weight;
      if (alt < distances.get(neighbor.id)!) {
        distances.set(neighbor.id, alt);
        previous.set(neighbor.id, currentId);
      }
    }
  }

  // Reconstruct path
  const pathIds: string[] = [];
  let curr: string | null = endId;
  while (curr) {
    pathIds.unshift(curr);
    curr = previous.get(curr) || null;
  }

  if (pathIds.length <= 1 || pathIds[0] !== startId) {
    return null;
  }

  const rawPoints = pathIds.map((id) => nodes.get(id)!.coords);

  // Preserve the first connector (room center -> corridor node) and last connector (corridor node -> room center)
  // Clean corridor smoothing without cutting through walls
  return simplifyCorridorPointsPreservingConnectors(rawPoints);
}

/**
 * Simplifies collinear corridor waypoints while strictly preserving the first and last
 * doorway connectors to avoid drawing route lines through room walls.
 */
function simplifyCorridorPointsPreservingConnectors(points: Point[]): Point[] {
  if (points.length <= 3) return points;

  const startPt = points[0];
  const firstDoorNode = points[1];
  const lastDoorNode = points[points.length - 2];
  const endPt = points[points.length - 1];

  // Ramer-Douglas-Peucker in aspect-corrected units (1 unit = 1% of map height ~= 0.34 m).
  // Removes the small wiggles of traced corridor centrelines so directions only mention real turns.
  const corridorSegment = points.slice(1, points.length - 1);
  const EPS = 1.6;
  const perp = (p: Point, a: Point, b: Point) => {
    const ax = a.x * MAP_ASPECT_RATIO, ay = a.y, bx = b.x * MAP_ASPECT_RATIO, by = b.y, px = p.x * MAP_ASPECT_RATIO, py = p.y;
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (L === 0) return Math.hypot(px - ax, py - ay);
    return Math.abs(dy * px - dx * py + bx * ay - by * ax) / L;
  };
  const rdp = (pts: Point[]): Point[] => {
    if (pts.length <= 2) return pts;
    let idx = 0, dmax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perp(pts[i], pts[0], pts[pts.length - 1]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax <= EPS) return [pts[0], pts[pts.length - 1]];
    const left = rdp(pts.slice(0, idx + 1));
    return [...left.slice(0, -1), ...rdp(pts.slice(idx))];
  };
  const simplifiedCorridor = corridorSegment.length > 1 ? rdp(corridorSegment) : corridorSegment;

  return [startPt, ...simplifiedCorridor, endPt];
}

/**
 * Builds cumulative segment lengths in meters for a polyline of waypoints
 */
export function buildLegMetrics(
  waypoints: Point[],
  buildingType: string = ''
): {
  distanceMeters: number;
  segmentLengths: number[];
  cumulativeSegmentDistances: number[];
} {
  if (waypoints.length <= 1) {
    return {
      distanceMeters: 0,
      segmentLengths: [],
      cumulativeSegmentDistances: [0],
    };
  }

  const segmentLengths: number[] = [];
  const cumulativeSegmentDistances: number[] = [0];
  let running = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const dPct = aspectDistance(waypoints[i], waypoints[i + 1]);
    const segMeters = pctToMeters(dPct, buildingType);
    segmentLengths.push(segMeters);
    running += segMeters;
    cumulativeSegmentDistances.push(running);
  }

  return {
    distanceMeters: running,
    segmentLengths,
    cumulativeSegmentDistances,
  };
}

/**
 * Generates NavigationSteps with cumulative distance along the entire route
 */
function generateStepsForWaypoints(
  waypoints: Point[],
  floor: number,
  startName: string,
  endName: string,
  floorPlan: FloorPlanData,
  startRoomId?: string,
  endRoomId?: string,
  stepOffset: number = 1,
  startCumulativeDist: number = 0
): { steps: NavigationStep[]; totalStepDistance: number } {
  const steps: NavigationStep[] = [];
  let cumulativeDist = startCumulativeDist;

  for (let i = 0; i < waypoints.length; i++) {
    const pt = waypoints[i];
    if (i === 0) {
      steps.push({
        stepNumber: stepOffset,
        instruction: `Start at ${startName} (Level ${floor}). Head into the corridor.`,
        coords: pt,
        floor,
        distanceMeters: 0,
        cumulativeDistanceMeters: Math.round(cumulativeDist * 10) / 10,
        action: 'start',
      });
    } else if (i === waypoints.length - 1) {
      const segDist = pctToMeters(aspectDistance(waypoints[i - 1], pt), floorPlan.buildingType);
      cumulativeDist += segDist;

      steps.push({
        stepNumber: stepOffset + steps.length,
        instruction: `Arrive at ${endName}. Destination is directly ahead.`,
        coords: pt,
        floor,
        distanceMeters: segDist,
        cumulativeDistanceMeters: Math.round(cumulativeDist * 10) / 10,
        action: 'arrive',
      });
    } else {
      const segDist = pctToMeters(aspectDistance(waypoints[i - 1], pt), floorPlan.buildingType);
      cumulativeDist += segDist;

      const action = calculateTurnAction(waypoints[i - 1], pt, waypoints[i + 1]);
      const nearestRoom = findNearbyRoom(pt, floorPlan.rooms, [startRoomId, endRoomId]);
      const landmarkNote = nearestRoom ? `near ${nearestRoom.name}` : undefined;

      let maneuverText = 'Continue straight down the corridor';
      if (action === 'turn-left') maneuverText = 'Turn left at the corridor junction';
      else if (action === 'turn-right') maneuverText = 'Turn right at the corridor junction';
      else if (action === 'slight-left') maneuverText = 'Bear slightly left down the corridor';
      else if (action === 'slight-right') maneuverText = 'Bear slightly right down the corridor';

      if (landmarkNote) {
        maneuverText += ` (${landmarkNote})`;
      }

      steps.push({
        stepNumber: stepOffset + steps.length,
        instruction: `${maneuverText} for ~${Math.round(segDist)}m.`,
        coords: pt,
        floor,
        distanceMeters: segDist,
        cumulativeDistanceMeters: Math.round(cumulativeDist * 10) / 10,
        action,
        landmarkNote,
      });
    }
  }

  return { steps, totalStepDistance: cumulativeDist - startCumulativeDist };
}

/**
 * Main indoor routing function:
 * - Uses correct floor graph from allFloors for both same-floor and multi-floor routes
 * - Builds ONE ordered list of legs for arc-length continuous speed
 * - Accurately sets cumulativeDistanceMeters on all NavigationSteps
 */
export function calculateIndoorRoute(
  floorPlan: FloorPlanData,
  startPoint: Point,
  startName: string,
  endPoint: Point,
  endName: string,
  startRoomId?: string,
  endRoomId?: string,
  options?: {
    isAccessibleOnly?: boolean;
    allFloors?: FloorPlanData[];
    startFloor?: number;
    endFloor?: number;
    closures?: RouteClosures;
    /** Stairs/elevators joining floors. Defaults to the E5 links for E5 floors and none elsewhere. */
    verticalLinks?: VerticalCirculationLink[];
  }
): NavigationRoute {
  const closures = options?.closures;
  const startFloor = options?.startFloor || floorPlan.floorNumber || 1;
  const endFloor = options?.endFloor || floorPlan.floorNumber || 1;
  const isAccessibleOnly = options?.isAccessibleOnly ?? true;
  const allFloors = options?.allFloors || [floorPlan];

  // BUG 6 FIX: Always retrieve the correct floor graph by startFloor from allFloors
  const startFloorPlan = allFloors.find((f) => f.floorNumber === startFloor) || floorPlan;
  const endFloorPlan = allFloors.find((f) => f.floorNumber === endFloor) || floorPlan;
  // Without a hallway network the only possible line goes through walls: refuse instead.
  for (const p of [startFloorPlan, endFloorPlan]) if (!p.hallways?.length) throw new Error(`No hallway network is mapped on floor ${p.floorNumber} of ${p.buildingName || 'this building'}, so there is no indoor route yet.`);

  const flaggedNotes: string[] = [];
  if (
    startName.toLowerCase().includes('3818') ||
    endName.toLowerCase().includes('3818') ||
    startName.toLowerCase().includes('bridge') ||
    endName.toLowerCase().includes('bridge')
  ) {
    flaggedNotes.push(
      'CAUTION: University of Waterloo campus accessibility documentation contains conflicting descriptions for the E3 bridge (cited as connecting Level 3 vs Level 5). Please verify physical threshold ramp.'
    );
  }

  // CASE 1: Both start and destination on the SAME floor
  if (startFloor === endFloor) {
    const waypoints = findPathAvoiding(
      startFloorPlan,
      startPoint,
      endPoint,
      startRoomId,
      endRoomId,
      closures,
      flaggedNotes
    );

    const legMetrics = buildLegMetrics(waypoints, startFloorPlan.buildingType);

    const { steps } = generateStepsForWaypoints(
      waypoints,
      startFloor,
      startName,
      endName,
      startFloorPlan,
      startRoomId,
      endRoomId,
      1,
      0
    );

    const leg0: RouteLeg = {
      id: `leg-f${startFloor}`,
      type: 'floor',
      floor: startFloor,
      waypoints,
      startDistanceMeters: 0,
      distanceMeters: legMetrics.distanceMeters,
      segmentLengths: legMetrics.segmentLengths,
      cumulativeSegmentDistances: legMetrics.cumulativeSegmentDistances,
    };

    const totalDistanceMeters = Math.max(1, Math.round(legMetrics.distanceMeters * 10) / 10);
    const estimatedWalkTimeMinutes = Math.max(
      1,
      Math.round((totalDistanceMeters / 70) * 10) / 10
    );
    const spokenOverview = `Route ready from ${startName} to ${endName} on Level ${startFloor}. Approx ${Math.round(
      totalDistanceMeters
    )} meters, about ${Math.ceil(estimatedWalkTimeMinutes)} min walk.`;

    return {
      id: `route-${Date.now()}`,
      fromName: startName,
      toName: endName,
      fromFloor: startFloor,
      toFloor: endFloor,
      fromCoords: startPoint,
      toCoords: endPoint,
      totalDistanceMeters,
      estimatedWalkTimeMinutes,
      isAccessible: true,
      activeFloor: startFloor,
      legs: [leg0],
      floorSegments: [
        {
          floor: startFloor,
          waypoints,
          steps,
        },
      ],
      waypoints,
      steps,
      spokenOverview,
      pathDescription: `Path follows ${steps.length} indoor steps via Level ${startFloor} corridors.`,
      flaggedNotes,
    };
  }

  // CASE 2: MULTI-FLOOR NAVIGATION (BUG 4 FIX: Ordered Legs with Vertical Transition Pause)
  const links = options?.verticalLinks ?? (startFloorPlan.buildingId === 'uwaterloo-e5' ? E5_VERTICAL_LINKS : []);
  if (!links.length) throw new Error(`No stairs or elevators are mapped between floors ${startFloor} and ${endFloor} of ${startFloorPlan.buildingName || 'this building'}.`);
  let chosenLink: VerticalCirculationLink | undefined;
  const openLinks = links.filter((l) => !closures?.linkIds.has(l.id));
  if (isAccessibleOnly) {
    chosenLink = openLinks.find(
      (l) =>
        l.accessible &&
        l.floorsServed.includes(startFloor) &&
        l.floorsServed.includes(endFloor)
    );
  } else {
    if (startFloor >= 2 && endFloor >= 2) {
      chosenLink = openLinks.find((l) => l.id === 'v-link-stair-e');
    }
    if (!chosenLink) {
      chosenLink = openLinks.find(
        (l) => l.floorsServed.includes(startFloor) && l.floorsServed.includes(endFloor)
      );
    }
  }

  if (!chosenLink) {
    chosenLink = links[0]; // first link (E5: Southeast elevators)
  }
  if (closures?.linkIds.has(chosenLink.id)) {
    flaggedNotes.unshift(`${chosenLink.name} is reported out of service and no other ${isAccessibleOnly ? 'step-free ' : ''}way between these floors is mapped.`);
  } else if (closures?.unconfirmedLinkIds.has(chosenLink.id)) {
    flaggedNotes.unshift(`Unconfirmed report: ${chosenLink.name} may be out of service.`);
  } else if (closures?.linkIds.size && links.some((l) => closures.linkIds.has(l.id) && l.floorsServed.includes(startFloor) && l.floorsServed.includes(endFloor))) {
    flaggedNotes.unshift(`Using ${chosenLink.name}: another stair or elevator on this route is reported closed.`);
  }

  const startVertNode =
    chosenLink.nodes.find((n) => n.floor === startFloor) || chosenLink.nodes[0];
  const endVertNode =
    chosenLink.nodes.find((n) => n.floor === endFloor) || chosenLink.nodes[0];

  const startVertRoom = startFloorPlan.rooms.find(
    (r) => r.id === startVertNode.roomId
  ) || {
    coords: { x: 60.5, y: 26.5 },
    name: chosenLink.name,
  };
  const endVertRoom = endFloorPlan.rooms.find(
    (r) => r.id === endVertNode.roomId
  ) || {
    coords: { x: 60.5, y: 26.5 },
    name: chosenLink.name,
  };

  // 1. Path on start floor
  const seg1Waypoints = findPathAvoiding(
    startFloorPlan,
    startPoint,
    startVertRoom.coords,
    startRoomId,
    startVertNode.roomId,
    closures,
    flaggedNotes
  );
  const leg1Metrics = buildLegMetrics(seg1Waypoints, startFloorPlan.buildingType);

  const seg1Gen = generateStepsForWaypoints(
    seg1Waypoints,
    startFloor,
    startName,
    startVertRoom.name,
    startFloorPlan,
    startRoomId,
    startVertNode.roomId,
    1,
    0
  );

  // 2. Vertical transition pause
  const floorDiff = Math.abs(endFloor - startFloor);
  const direction = endFloor > startFloor ? 'up' : 'down';
  const vertAction: ManeuverAction =
    chosenLink.type === 'elevator' ? 'take-elevator' : 'take-stairs';

  // Demo speed is 1.3 m/s * 4x = 5.2 m/s. A 2.0-second pause is ~10.4 meters.
  const verticalEquivalentMeters = Math.max(10.4, floorDiff * 6);
  const vertCumulativeDist = leg1Metrics.distanceMeters + verticalEquivalentMeters;

  const verticalStep: NavigationStep = {
    stepNumber: seg1Gen.steps.length + 1,
    instruction: `Take ${chosenLink.name} ${direction} ${floorDiff} floor${
      floorDiff > 1 ? 's' : ''
    } to Level ${endFloor} (${
      chosenLink.accessible ? 'Wheelchair Accessible' : 'Stairs'
    }).`,
    coords: startVertRoom.coords,
    floor: startFloor,
    distanceMeters: Math.round(verticalEquivalentMeters * 10) / 10,
    cumulativeDistanceMeters: Math.round(vertCumulativeDist * 10) / 10,
    action: vertAction,
    isVerticalTransition: true,
    floorChange: {
      fromFloor: startFloor,
      toFloor: endFloor,
      via: chosenLink.name,
    },
  };

  // 3. Path on destination floor
  const seg2Waypoints = findPathAvoiding(
    endFloorPlan,
    endVertRoom.coords,
    endPoint,
    endVertNode.roomId,
    endRoomId,
    closures,
    flaggedNotes
  );
  const leg2Metrics = buildLegMetrics(seg2Waypoints, endFloorPlan.buildingType);

  const seg2Gen = generateStepsForWaypoints(
    seg2Waypoints,
    endFloor,
    endVertRoom.name,
    endName,
    endFloorPlan,
    endVertNode.roomId,
    endRoomId,
    seg1Gen.steps.length + 2,
    vertCumulativeDist
  );

  // Build the 3 ordered legs: [Floor 1] -> [Vertical Transition] -> [Floor 2]
  const leg0: RouteLeg = {
    id: `leg-f${startFloor}`,
    type: 'floor',
    floor: startFloor,
    waypoints: seg1Waypoints,
    startDistanceMeters: 0,
    distanceMeters: leg1Metrics.distanceMeters,
    segmentLengths: leg1Metrics.segmentLengths,
    cumulativeSegmentDistances: leg1Metrics.cumulativeSegmentDistances,
  };

  const legVert: RouteLeg = {
    id: `leg-vert-${startFloor}-${endFloor}`,
    type: 'vertical',
    floor: startFloor,
    toFloor: endFloor,
    via: chosenLink.name,
    waypoints: [startVertRoom.coords, endVertRoom.coords],
    startDistanceMeters: leg1Metrics.distanceMeters,
    distanceMeters: verticalEquivalentMeters,
    segmentLengths: [verticalEquivalentMeters],
    cumulativeSegmentDistances: [0, verticalEquivalentMeters],
  };

  const leg2: RouteLeg = {
    id: `leg-f${endFloor}`,
    type: 'floor',
    floor: endFloor,
    waypoints: seg2Waypoints,
    startDistanceMeters: leg1Metrics.distanceMeters + verticalEquivalentMeters,
    distanceMeters: leg2Metrics.distanceMeters,
    segmentLengths: leg2Metrics.segmentLengths,
    cumulativeSegmentDistances: leg2Metrics.cumulativeSegmentDistances,
  };

  const combinedSteps = [...seg1Gen.steps, verticalStep, ...seg2Gen.steps];
  const totalDistanceMeters =
    Math.round(
      (leg1Metrics.distanceMeters + verticalEquivalentMeters + leg2Metrics.distanceMeters) *
        10
    ) / 10;
  const estimatedWalkTimeMinutes = Math.max(
    1,
    Math.round(
      (totalDistanceMeters / 70 + (chosenLink.type === 'elevator' ? 1.0 : 0.5)) * 10
    ) / 10
  );

  const spokenOverview = `Multi-floor route ready from ${startName} (Level ${startFloor}) to ${endName} (Level ${endFloor}). Take ${chosenLink.name} ${direction} to Level ${endFloor}. Total ~${Math.round(
    totalDistanceMeters
  )}m, about ${Math.ceil(estimatedWalkTimeMinutes)} min.`;

  return {
    id: `route-mf-${Date.now()}`,
    fromName: startName,
    toName: endName,
    fromFloor: startFloor,
    toFloor: endFloor,
    fromCoords: startPoint,
    toCoords: endPoint,
    totalDistanceMeters,
    estimatedWalkTimeMinutes,
    isAccessible: chosenLink.accessible,
    activeFloor: startFloor,
    legs: [leg0, legVert, leg2],
    floorSegments: [
      {
        floor: startFloor,
        waypoints: seg1Waypoints,
        steps: seg1Gen.steps,
      },
      {
        floor: endFloor,
        waypoints: seg2Waypoints,
        steps: seg2Gen.steps,
      },
    ],
    waypoints: seg1Waypoints,
    steps: combinedSteps,
    spokenOverview,
    pathDescription: `Multi-floor route with ${combinedSteps.length} steps via ${chosenLink.name}.`,
    flaggedNotes,
  };
}

function findNearbyRoom(
  pt: Point,
  rooms: RoomPOI[],
  excludeIds: (string | undefined)[]
): RoomPOI | null {
  let closest: RoomPOI | null = null;
  let minD = 14;

  for (const r of rooms) {
    if (excludeIds.includes(r.id)) continue;
    const d = aspectDistance(pt, r.coords);
    if (d < minD) {
      minD = d;
      closest = r;
    }
  }
  return closest;
}
