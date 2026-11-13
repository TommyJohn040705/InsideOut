/**
 * Reads the printed room numbers off a University of Waterloo Plant Operations floor-plan sheet,
 * with each label's position. Rooms only: corridor tracing by Gemini was tested on DC floor 1
 * (2026-11-12) and crossed walls, so hallways are never taken from it.
 * Positions use Gemini's native [y, x] 0-1000 grid, which matched OSM rooms on DC to a few metres.
 */
import { Type } from '@google/genai';

export const ROOM_CATEGORIES_UW = ['restroom', 'elevator', 'stairs', 'entrance', 'corridor', 'classroom', 'lab', 'office', 'conference', 'utility', 'other'];

type Generate = (params: any) => Promise<{ text?: string; modelVersion?: string }>;

export function plantOpsPrompt(buildingCode: string, floorCode: string) {
  return `University of Waterloo Plant Operations floor-plan sheet: building ${buildingCode}, floor ${floorCode}.
Ignore the title block, legend, north arrow, notes, the small key map / site inset and neighbouring buildings.
List EVERY room number printed inside the building drawing, exactly as printed (never invent one). For each give:
n: the number as printed; name: a printed room name if there is one, else empty;
c: one of ${ROOM_CATEGORIES_UW.join(', ')} (the legend marks washrooms M = men, W = women, S = single-use; ELV = elevator; corridors carry their own numbers);
p: the centre of the printed label as [y, x] on a 0-1000 grid over the whole image.
Also give title (the sheet title). JSON only.`;
}

/** Turns Gemini's answer into rooms in the app's percent coordinates; drops malformed and duplicate labels. */
export function parseRooms(parsed: any) {
  const seen = new Set<string>();
  return (parsed?.rooms || [])
    .filter((r: any) => {
      const n = String(r?.n || '').trim();
      const ok = !!n && Array.isArray(r.p) && r.p.length === 2 && r.p.every((v: number) => Number.isFinite(v) && v >= 0 && v <= 1000) && !seen.has(n);
      if (ok) seen.add(n);
      return ok;
    })
    .map((r: any, i: number) => {
      const n = String(r.n).trim();
      return {
        id: `r${i + 1}-${n.replace(/[^A-Za-z0-9]/g, '')}`,
        roomNumber: n,
        name: String(r.name || '').trim() || `Room ${n}`,
        category: ROOM_CATEGORIES_UW.includes(r.c) ? r.c : 'other',
        coords: { x: +(r.p[1] / 10).toFixed(2), y: +(r.p[0] / 10).toFixed(2) },
      };
    });
}

export async function readPlantOpsSheet(generate: Generate, image: { mimeType: string; data: string }, buildingCode: string, floorCode: string) {
  const response = await generate({
    model: 'gemini-3.6-flash',
    contents: { parts: [{ inlineData: image }, { text: plantOpsPrompt(buildingCode, floorCode) }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          rooms: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { n: { type: Type.STRING }, name: { type: Type.STRING }, c: { type: Type.STRING }, p: { type: Type.ARRAY, items: { type: Type.NUMBER } } }, required: ['n', 'c', 'p'] } },
        },
        required: ['rooms'],
      },
    },
  });
  const parsed = JSON.parse(response.text || '{}');
  return { title: parsed.title as string | undefined, summary: undefined, model: response.modelVersion || 'gemini flash', rooms: parseRooms(parsed), hallways: [] as any[] };
}
