// Core data model for an InsideOut building.
// A building is a graph: nodes are places (rooms, corridor junctions, stairs,
// elevators, entrances) and edges are walkable connections between them.

export type NodeKind = 'room' | 'corridor' | 'stairs' | 'elevator' | 'entrance';

export interface MapNode {
  id: string;
  floorId: string;
  kind: NodeKind;
  /** Map coordinates in metres within the floor plan. */
  x: number;
  y: number;
  /** Display name, e.g. "Room 101" or "Main Elevator". */
  label?: string;
  /** Searchable aliases, e.g. ["101", "Lecture Hall A"]. */
  aliases?: string[];
  /**
   * Nodes that represent the same vertical shaft on different floors share a
   * shaftId (e.g. every stop of "Elevator A"). Used for floor transitions.
   */
  shaftId?: string;
  /** Place category used for quick filters, e.g. restroom, dining, exit. */
  category?: PlaceCategory;
  description?: string;
}

export type PlaceCategory =
  | 'restroom'
  | 'office'
  | 'conference'
  | 'classroom'
  | 'entrance'
  | 'exit'
  | 'elevator'
  | 'stairs'
  | 'dining'
  | 'medical'
  | 'reception'
  | 'gate'
  | 'utility'
  | 'store'
  | 'other';

export type EdgeKind = 'walkway' | 'stairs' | 'elevator';

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface RoomShape {
  nodeId: string;
  /** Polygon outline in floor coordinates. */
  polygon: Array<[number, number]>;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  width: number;
  height: number;
  rooms: RoomShape[];
  /** Optional background image (data URL or path) stretched over the floor. */
  imageUrl?: string;
}

export interface Building {
  id: string;
  name: string;
  description?: string;
  floors: Floor[];
  nodes: MapNode[];
  edges: MapEdge[];
}

export type ReportKind = 'blocked-corridor' | 'elevator-out' | 'stairs-closed';

export interface Report {
  id: string;
  /** Building the report belongs to. */
  buildingId?: string;
  kind: ReportKind;
  /** Edge id for blocked corridors, or shaftId for elevators and stairwells. */
  targetId: string;
  note?: string;
  createdAt: number;
  /** Number of people who confirmed the issue (crowdsourced, Waze style). */
  confirmations: number;
  /** Number of people who said the issue is cleared. */
  clears: number;
  /** Reports expire automatically so stale issues stop affecting routes. */
  expiresAt: number;
}

export interface RouteOptions {
  accessible: boolean;
}

export type Maneuver =
  | 'start'
  | 'straight'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'take-elevator'
  | 'take-stairs'
  | 'arrive';

export interface RouteStep {
  nodeId: string;
  floorId: string;
  instruction: string;
  action: Maneuver;
  /** Walking distance in metres covered by this step. */
  distance: number;
}

export interface Route {
  nodeIds: string[];
  edgeIds: string[];
  distance: number;
  /** Real walking distance in metres (excludes vertical-travel penalties). */
  walkDistance: number;
  /** Estimated travel time in minutes at 1.2 m/s plus vertical travel. */
  minutes: number;
  steps: RouteStep[];
  /** Number of nodes A* expanded (diagnostic). */
  expanded?: number;
}
