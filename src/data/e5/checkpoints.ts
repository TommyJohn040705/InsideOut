import { QRCheckpoint } from '../../types/navigation';

// App-defined checkpoint codes. No QR codes are posted in E5 yet, so none is official.
// Positions come from the matching room (App uses room coords when the room exists).
export const E5_CHECKPOINTS: QRCheckpoint[] = [
  // Floor 1 Checkpoints
  {
    id: 'chk-e5-l1-entrance',
    code: 'E5-L1-EAST-ENTRANCE',
    name: 'Level 1 East Ground Entrance & Concourse (1816)',
    floor: 1,
    coords: { x: 70.49, y: 83.06 },
    roomId: 'e5-1816',
    roomNumber: '1816',
    description: 'Ground level concourse entrance pillar checkpoint',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l1-elev',
    code: 'E5-L1-ELEV-SE',
    name: 'Level 1 Southeast Elevator Bank (1801)',
    floor: 1,
    coords: { x: 64.0, y: 35.4 },
    roomId: 'e5-1801',
    roomNumber: '1801',
    description: 'Elevator call station plaque on Level 1',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l1-sedra',
    code: 'E5-L1-SEDRA-CENTRAL',
    name: 'Sedra Student Design Centre Central Workbays (1001)',
    floor: 1,
    coords: { x: 45.0, y: 55.0 },
    roomId: 'e5-1001',
    roomNumber: '1001',
    description: 'Sedra SDC main corridor kiosk checkpoint',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l1-shop',
    code: 'E5-L1-MACHINE-SHOP',
    name: 'Engineering Student Machine Shop (1101)',
    floor: 1,
    coords: { x: 61.53, y: 19.05 },
    roomId: 'e5-1101',
    roomNumber: '1101',
    description: 'Student Machine Shop safety reception entrance',
    verifiedOfficial: false,
  },

  // Floor 2 Checkpoints
  {
    id: 'chk-e5-l2-main-entrance',
    code: 'E5-L2-MAIN-ENTRANCE',
    name: 'Level 2 Main Campus Entrance (2811)',
    floor: 2,
    coords: { x: 56.6, y: 52.42 },
    roomId: 'e5-2811',
    roomNumber: '2811',
    description: 'Ring Road pedestrian bridge entrance vestibule',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l2-atrium',
    code: 'E5-L2-ATRIUM',
    name: 'Level 2 Central Atrium & Monumental Stair E (2808)',
    floor: 2,
    coords: { x: 50.2, y: 46.0 },
    roomId: 'e5-2808',
    roomNumber: '2808',
    description: 'Main central atrium directory pillar next to Stair E',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l2-elev',
    code: 'E5-L2-ELEV-SE',
    name: 'Level 2 Southeast Elevator Bank (2801)',
    floor: 2,
    coords: { x: 64.0, y: 35.4 },
    roomId: 'e5-2801',
    roomNumber: '2801',
    description: 'Elevator lobby frame on Level 2',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l2-gear',
    code: 'E5-L2-GEAR-LAB',
    name: 'Gear Computer Lab Entryway (2108)',
    floor: 2,
    coords: { x: 79.07, y: 59.78 },
    roomId: 'e5-2108',
    roomNumber: '2108',
    description: 'Gear computer lab card-reader entrance station',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l2-rpc',
    code: 'E5-L2-RAPID-PROTO',
    name: 'Rapid Prototyping Centre Entry (2002)',
    floor: 2,
    coords: { x: 33.81, y: 19.05 },
    roomId: 'e5-2002',
    roomNumber: '2002',
    description: '3D printing and laser cutting workshop doorway',
    verifiedOfficial: false,
  },

  // Floor 3 Checkpoints
  {
    id: 'chk-e5-l3-elev',
    code: 'E5-L3-ELEV-SE',
    name: 'Level 3 Southeast Elevator Lobby (3801)',
    floor: 3,
    coords: { x: 62.86, y: 54.33 },
    roomId: 'e5-3801',
    roomNumber: '3801',
    description: 'Elevator foyer on Level 3 near classrooms',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l3-hall-3101',
    code: 'E5-3101',
    name: 'Department Lecture Hall E5-3101 Entrance',
    floor: 3,
    coords: { x: 86.47, y: 52.72 },
    roomId: 'e5-3101',
    roomNumber: '3101',
    description: 'Tiered lecture hall 3101 doorway placard',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l3-hall-3102',
    code: 'E5-3102',
    name: 'Department Lecture Hall E5-3102 Entrance',
    floor: 3,
    coords: { x: 78.4, y: 22.0 },
    roomId: 'e5-3102',
    roomNumber: '3102',
    description: 'Lecture hall 3102 doorway placard',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l3-bridge',
    code: 'E5-L3-E3-BRIDGE',
    name: 'Engineering 3 (E3) Pedestrian Bridge Link (3818)',
    floor: 3,
    coords: { x: 90.97, y: 85.38 },
    roomId: 'e5-3818',
    roomNumber: '3818',
    description: 'E3 connecting skybridge entryway',
    verifiedOfficial: false,
  },

  // Floor 4 Checkpoints
  {
    id: 'chk-e5-l4-elev',
    code: 'E5-L4-ELEV-SE',
    name: 'Level 4 Southeast Elevator Lobby (4801)',
    floor: 4,
    coords: { x: 64.98, y: 32.56 },
    roomId: 'e5-4801',
    roomNumber: '4801',
    description: 'Elevator foyer on Level 4 ECE floor',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l4-colloquium',
    code: 'E5-L4-ECE-COLLOQUIUM',
    name: 'ECE Department Conference Suite (4101)',
    floor: 4,
    coords: { x: 58.92, y: 18.15 },
    roomId: 'e5-4101',
    roomNumber: '4101',
    description: 'ECE colloquium suite entrance portal',
    verifiedOfficial: false,
  },

  // Floor 5 Checkpoints
  {
    id: 'chk-e5-l5-elev',
    code: 'E5-L5-ELEV-SE',
    name: 'Level 5 Southeast Elevator Lobby (5801)',
    floor: 5,
    coords: { x: 64.95, y: 32.46 },
    roomId: 'e5-5801',
    roomNumber: '5801',
    description: 'Elevator foyer on Level 5 Dean Suite level',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l5-dean',
    code: 'E5-L5-DEAN-SUITE',
    name: 'Dean of Engineering Executive Boardroom (5101)',
    floor: 5,
    coords: { x: 58.88, y: 18.15 },
    roomId: 'e5-5101',
    roomNumber: '5101',
    description: 'Dean executive reception checkpoint',
    verifiedOfficial: false,
  },

  // Floor 6 Checkpoints
  {
    id: 'chk-e5-l6-elev',
    code: 'E5-L6-ELEV-SE',
    name: 'Level 6 Southeast Elevator Lobby (6801)',
    floor: 6,
    coords: { x: 64.69, y: 33.27 },
    roomId: 'e5-6801',
    roomNumber: '6801',
    description: 'Elevator foyer on Level 6 SYDE floor',
    verifiedOfficial: false,
  },
  {
    id: 'chk-e5-l6-syde',
    code: 'E5-L6-SYDE-LAB',
    name: 'Systems Design Teaching Laboratory (6005)',
    floor: 6,
    coords: { x: 42.45, y: 25.1 },
    roomId: 'e5-6005',
    roomNumber: '6005',
    description: 'Systems Design core laboratory entryway',
    verifiedOfficial: false,
  },
];

/**
 * Finds a checkpoint by exact code or substring match
 */
export function resolveCheckpoint(rawInput: string): QRCheckpoint | null {
  const clean = rawInput.trim().toUpperCase().replace(/^QR:\s*/i, '');
  if (!clean) return null;

  // Exact code match
  const exact = E5_CHECKPOINTS.find((c) => c.code.toUpperCase() === clean || c.id.toUpperCase() === clean);
  if (exact) return exact;

  // Match room number format like "3101" or "E5-3101"
  const roomMatch = clean.match(/(?:E5[\s-]*)?(\d{4}[A-Z]?)/i);
  if (roomMatch) {
    const rNum = roomMatch[1];
    const match = E5_CHECKPOINTS.find((c) => c.roomNumber?.toUpperCase() === rNum || c.code.includes(rNum));
    if (match) return match;
  }

  // Partial name/code match
  const partial = E5_CHECKPOINTS.find((c) => c.code.includes(clean) || clean.includes(c.code));
  if (partial) return partial;

  return null;
}
