/**
 * Core navigation and indoor wayfinding data types
 */

export interface Point {
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
}

export type POICategory =
  | 'restroom'
  | 'office'
  | 'conference'
  | 'classroom'
  | 'lab'
  | 'workshop'
  | 'entrance'
  | 'exit'
  | 'elevator'
  | 'stairs'
  | 'dining'
  | 'study'
  | 'medical'
  | 'reception'
  | 'gate'
  | 'utility'
  | 'store'
  | 'bridge'
  | 'other';

export type VerificationStatus =
  | 'verified_official_source'
  | 'unverified_drawing_only'
  | 'web_lookup_user_approved'
  | 'staff_reported'
  | 'unknown';

export type PhysicalVerification =
  | 'verified_drawing'
  | 'approximate'
  | 'manual_review';

export type NavigabilityVerification =
  | 'verified_walkable'
  | 'provisional_corridor_access'
  | 'flagged_review';

export interface RoomPOI {
  id: string;
  name: string;
  roomNumber?: string;
  category: POICategory;
  coords: Point;
  bounds?: { x: number; y: number; width: number; height: number };
  description?: string;
  purpose?: string;
  floor?: number;
  buildingId?: string;
  sourceUrl?: string;
  drawingRevisionDate?: string;
  physicalLocationVerification?: PhysicalVerification;
  purposeVerification?: VerificationStatus;
  navigabilityVerification?: NavigabilityVerification;
  accessible?: boolean;
  notes?: string;
  /** web pages found by the room lookup, shown with the purpose */
  sources?: { title: string; url: string }[];
  lookupConfidence?: 'high' | 'medium' | 'low' | 'none';
  /** small photo added with a staff report (data URL) */
  photo?: string;
  reportedAt?: string;
}

export interface CorridorNode {
  id: string;
  coords: Point;
  label?: string;
  floor?: number;
  connectedTo: string[]; // IDs of connected hallway nodes or room POIs
}

export interface FloorPlanData {
  id: string;
  title: string;
  subTitle?: string;
  floorNumber: number;
  buildingId?: string;
  buildingName?: string;
  buildingType: string;
  summary: string;
  scaleNote?: string;
  drawingNumber?: string;
  drawingRevisionDate?: string;
  imageUrl: string; // Background map: clean traced SVG for E5
  originalImageUrl?: string; // Original architectural drawing (raster)
  pdfAsset?: string;
  rooms: RoomPOI[];
  hallways: CorridorNode[];
  defaultStartId?: string;
  source: 'camera' | 'upload' | 'sample' | 'official';
  accessibleSummary?: string;
  keyHighlights?: string[];
}

export interface VerticalCirculationLink {
  id: string;
  type: 'elevator' | 'stairs' | 'bridge';
  name: string;
  floorsServed: number[];
  accessible: boolean;
  nodes: {
    floor: number;
    roomId: string;
    corridorNodeId: string;
  }[];
  description?: string;
}

export type ManeuverAction =
  | 'start'
  | 'straight'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'take-elevator'
  | 'take-stairs'
  | 'cross-bridge'
  | 'arrive';

export interface RouteLeg {
  id: string;
  type: 'floor' | 'vertical';
  floor: number;
  toFloor?: number;
  via?: string;
  waypoints: Point[];
  startDistanceMeters: number;
  distanceMeters: number;
  segmentLengths?: number[];
  cumulativeSegmentDistances?: number[];
}

export interface NavigationStep {
  stepNumber: number;
  instruction: string;
  coords: Point;
  floor: number;
  distanceMeters: number;
  cumulativeDistanceMeters: number;
  action: ManeuverAction;
  landmarkNote?: string;
  isVerticalTransition?: boolean;
  floorChange?: {
    fromFloor: number;
    toFloor: number;
    via: string;
  };
}

export interface NavigationRoute {
  id: string;
  fromName: string;
  toName: string;
  fromFloor: number;
  toFloor: number;
  fromCoords: Point;
  toCoords: Point;
  totalDistanceMeters: number;
  estimatedWalkTimeMinutes: number;
  isAccessible: boolean;
  activeFloor: number;
  legs: RouteLeg[];
  floorSegments: {
    floor: number;
    waypoints: Point[];
    steps: NavigationStep[];
  }[];
  waypoints: Point[]; // active floor waypoints for live canvas drawing
  steps: NavigationStep[]; // full turn-by-turn route
  spokenOverview: string;
  pathDescription: string;
  flaggedNotes?: string[];
}

export interface WayfinderQueryResponse {
  answer: string;
  suggestedDestinationId?: string;
  suggestedFloor?: number;
  relevantRoomIds?: string[];
  suggestedStartId?: string;
}

