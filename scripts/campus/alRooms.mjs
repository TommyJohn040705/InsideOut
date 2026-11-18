// Names and official facts for Arts Lecture Hall (AL) rooms, so AL reads like the traced E5 map.
// Facts come only from UW's AL accessibility page; positions (north/south side) from the aligned
// drawing, whose orientation was checked against OpenStreetMap's AL corridors and entrances.
// Run with the app server up: INSIDEOUT_URL=http://localhost:3001 node scripts/campus/alRooms.mjs
const BASE = process.env.INSIDEOUT_URL || 'http://localhost:3000';
const SRC = 'https://uwaterloo.ca/accessibility/arts-lecture-hall-al';
const official = (r, extra) => ({ ...r, ...extra, purposeVerification: 'verified_official_source', sourceUrl: SRC });
const HALLS = new Set(['105', '113', '116', '124']);
const KIND = { classroom: (n) => `AL ${n}`, restroom: (n) => `Washroom AL ${n}`, elevator: () => 'Elevator', stairs: () => 'Stairs', corridor: (n) => `Corridor AL ${n}`, entrance: (n) => `Entrance AL ${n}`, utility: (n) => `Service room AL ${n}`, office: (n) => `Office AL ${n}`, other: (n) => `Room AL ${n}` };

const floors = (await (await fetch(`${BASE}/api/floor-imports`, { headers: { Connection: 'close' } })).json()).filter((f) => f.buildingId === 'AL');
for (const f of floors) {
  const rooms = f.rooms.map((r) => {
    const n = r.roomNumber;
    if (!n) return r;
    let out = { ...r, name: (KIND[r.category] || KIND.other)(n) };
    if (HALLS.has(n)) out = official(out, { name: `AL ${n} lecture hall`, purpose: `Lecture hall on two levels; the elevator reaches its lower level (basement). Listed on UW's AL accessibility page.` });
    if (f.floorNumber === 1 && r.category === 'restroom') out = official(out, { purpose: "UW lists washrooms with an accessible stall on AL's 1st floor, west side (this is one of the two). Which stall is accessible is not stated." });
    if (f.floorNumber === -1 && n === '016') out = official(out, { name: 'North entrance (faces Dana Porter Library)', purpose: 'Ramped entrance with an automatic door, per UW\'s AL accessibility page.', accessible: true });
    if (f.floorNumber === -1 && n === '015') out = official(out, { name: 'South tunnel doors (to Hagey Hall, Modern Languages, Tatham Centre)', purpose: 'Tunnel access on the south side; the doors are not automatic, per UW\'s AL accessibility page.' });
    if (r.category === 'elevator') out = official(out, { purpose: 'Serves the basement, 1st and 2nd floors, per UW\'s AL accessibility page.' });
    return out;
  });
  const res = await fetch(`${BASE}/api/floor-imports/${encodeURIComponent(f.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify({ rooms }) });
  console.log(f.id, res.status, rooms.filter((r) => r.purposeVerification === 'verified_official_source').map((r) => r.name).join('; '));
}
