/**
 * Matches uploaded floor-plan files to campus buildings and floors for bulk import.
 * exact:     the filename is a Plant Operations manifest filename (one or more buildings: a
 *            Village 1 drawing set covers several houses).
 * guessed:   the name parses as <number><CODE>_<FLOOR> but is not in the manifest; a person must confirm.
 * none:      nothing recognisable; a person picks the building and floor.
 */
import { BUILDINGS, type CampusBuilding, type CampusFloor } from './campusData';

export type MatchConfidence = 'exact' | 'guessed' | 'none';

export interface FileMatch {
  confidence: MatchConfidence;
  targets: { building: CampusBuilding; floor: CampusFloor | null; floorCode: string }[];
  reason: string;
}

const byFilename = new Map<string, { building: CampusBuilding; floor: CampusFloor }[]>();
for (const b of BUILDINGS) for (const f of b.floors) {
  const k = f.filename.toLowerCase();
  byFilename.set(k, [...(byFilename.get(k) || []), { building: b, floor: f }]);
}
const byCode = new Map(BUILDINGS.filter((b) => b.code).map((b) => [b.code!.toUpperCase(), b]));

export function matchFile(name: string): FileMatch {
  const base = name.split(/[\\/]/).pop()!;
  const exact = byFilename.get(base.toLowerCase());
  if (exact) {
    const onMap = exact.filter((x) => x.building.footprint);
    if (!onMap.length) return { confidence: 'none', targets: [], reason: `${base} is a Plant Operations plan for ${exact[0].building.id}, which is not on the campus map (${exact[0].building.gap?.note || 'no footprint'}).` };
    return { confidence: 'exact', targets: onMap.map((x) => ({ building: x.building, floor: x.floor, floorCode: x.floor.floorCode })), reason: 'Filename is in the Plant Operations list.' };
  }
  const m = base.replace(/\.(pdf|png|jpe?g|webp|svg)$/i, '').toUpperCase().match(/^(\d{3})?([A-Z][A-Z0-9_]*?)[_ -]+(B\d|\d{1,2}|MEZ|CON|PH|RO)(?:FLR)?$/);
  if (m) {
    const b = byCode.get(m[2]);
    const code = /^\d$/.test(m[3]) ? `0${m[3]}` : m[3];
    if (b?.footprint) return { confidence: 'guessed', targets: [{ building: b, floor: b.floors.find((f) => f.floorCode === code) || null, floorCode: code }], reason: `Read building ${m[2]}, floor ${code} from the filename; not in the Plant Operations list, so confirm it.` };
  }
  return { confidence: 'none', targets: [], reason: 'Building and floor could not be read from the filename.' };
}
