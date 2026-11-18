import { FloorPlanData, RoomPOI, CorridorNode, VerticalCirculationLink } from '../../types/navigation';
import floorsJson from './floors.json';
import roomsJson from './rooms.json';
import facilitiesJson from './facilities.json';
import sourcesJson from './sources.json';
import graphJson from './navigationGraph.json';

export interface E5Source {
  id: string;
  name: string;
  url: string;
  domain: string;
  description: string;
  documentType: string;
  verifiedDate: string;
}

export interface E5Facility {
  id: string;
  name: string;
  building: string;
  primaryFloor: number;
  additionalFloors: number[];
  mainRoomId: string;
  category: string;
  description: string;
  officialUrl: string;
  verificationStatus: string;
  hours?: string;
  capacity?: number;
  accessible: boolean;
}

export const E5_SOURCES = sourcesJson as E5Source[];
export const E5_FACILITIES = facilitiesJson as E5Facility[];
export const E5_ROOMS = roomsJson as RoomPOI[];

// Build 6 interactive FloorPlanData objects from the official architectural drawings
export const E5_FLOORS: FloorPlanData[] = (floorsJson as any[]).map((f) => {
  const floorRooms = E5_ROOMS.filter((r) => r.floor === f.floorNumber);
  const floorHallways = ((graphJson as any).hallways as CorridorNode[]).filter(
    (h) => h.floor === f.floorNumber
  );

  return {
    id: f.id,
    title: f.title,
    subTitle: f.subTitle,
    floorNumber: f.floorNumber,
    buildingId: 'uwaterloo-e5',
    buildingName: 'Engineering 5 (E5)',
    buildingType: 'University Engineering & Research Complex',
    summary: `${f.subTitle}. Official Plant Operations Drawing ${f.drawingNumber} (${f.drawingRevisionDate}). ${f.washroomsSummary}`,
    scaleNote: `Drawing Scale ${f.scale}`,
    drawingNumber: f.drawingNumber,
    drawingRevisionDate: f.drawingRevisionDate,
    imageUrl: f.imageUrl,
    originalImageUrl: f.originalImageUrl,
    pdfAsset: f.pdfAsset,
    rooms: floorRooms,
    hallways: floorHallways,
    defaultStartId: f.defaultEntranceId,
    source: 'official',
    accessibleSummary: f.accessibility,
    keyHighlights: f.keyHighlights,
  };
});

export const E5_VERTICAL_LINKS = (graphJson as any).verticalLinks as VerticalCirculationLink[];

export function getE5Stats() {
  const totalRooms = E5_ROOMS.length;
  const verifiedPurpose = E5_ROOMS.filter((r) => r.purposeVerification === 'verified_official_source').length;
  const unknownPurpose = totalRooms - verifiedPurpose;

  const floorStats = [1, 2, 3, 4, 5, 6].map((f) => {
    const list = E5_ROOMS.filter((r) => r.floor === f);
    const vCount = list.filter((r) => r.purposeVerification === 'verified_official_source').length;
    return {
      floor: f,
      total: list.length,
      verified: vCount,
      unknown: list.length - vCount,
      revision: (floorsJson as any[]).find((fl) => fl.floorNumber === f)?.drawingRevisionDate || '',
    };
  });

  return {
    totalRooms,
    verifiedPurpose,
    unknownPurpose,
    floorStats,
    verticalLinksCount: E5_VERTICAL_LINKS.length,
    facilitiesCount: E5_FACILITIES.length,
    sourcesCount: E5_SOURCES.length,
  };
}

export function searchE5(query: string, floorFilter?: number): RoomPOI[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return E5_ROOMS.filter((r) => {
    if (floorFilter && r.floor !== floorFilter) return false;
    const matchNumber = r.roomNumber?.toLowerCase().includes(q);
    const matchName = r.name.toLowerCase().includes(q);
    const matchPurpose = r.purpose?.toLowerCase().includes(q);
    const matchCat = r.category.toLowerCase().includes(q);
    return matchNumber || matchName || matchPurpose || matchCat;
  });
}
