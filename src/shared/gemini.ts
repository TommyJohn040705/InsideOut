/**
 * Gemini helpers shared by the Node server (server/index.ts) and the browser.
 * The prompt and response schema come from the FloorNav prototype, which
 * produced richer results (room categories, hallway graph) than a plain
 * bounding-box prompt. Uses the REST API directly so it runs anywhere fetch does.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** FloorNav-format floor plan, coordinates are percentages (0-100). */
export interface FloorNavPoint {
  x: number;
  y: number;
}

export interface FloorNavRoom {
  id: string;
  name: string;
  roomNumber?: string;
  category: string;
  coords: FloorNavPoint;
  bounds?: { x: number; y: number; width: number; height: number };
  description?: string;
  accessible?: boolean;
}

export interface FloorNavHallway {
  id: string;
  coords: FloorNavPoint;
  label?: string;
  connectedTo: string[];
}

export interface FloorNavPlan {
  id?: string;
  title: string;
  floorNumber?: number;
  buildingType?: string;
  summary?: string;
  scaleNote?: string;
  imageUrl?: string;
  rooms: FloorNavRoom[];
  hallways: FloorNavHallway[];
  defaultStartId?: string;
}

export const CATEGORIES = [
  'restroom', 'office', 'conference', 'classroom', 'entrance', 'exit', 'elevator', 'stairs',
  'dining', 'medical', 'reception', 'gate', 'utility', 'store', 'other',
] as const;

export function floorPlanPrompt(buildingTypeHint?: string): string {
  return `You are an expert architectural digitizer and indoor navigation GIS system.
Analyze this floor plan image with high precision and extract a navigable indoor graph.
${buildingTypeHint ? `Context hint: the user says this building is a "${buildingTypeHint}".` : ''}

Coordinates are percentages: x from 0 (left edge of the image) to 100 (right edge), y from 0 (top) to 100 (bottom).

1. title, buildingType and a 2-sentence summary of the layout.
2. rooms: every distinct room, office, classroom, conference room, restroom, elevator, stairwell,
   emergency exit, entrance/lobby, dining area, clinic, store or utility area. For each:
   - id: unique lowercase id (e.g. "room-101", "elevator-a", "stairs-west")
   - name: descriptive name, using the label printed on the plan when visible
   - roomNumber: printed room number if any
   - category: one of ${CATEGORIES.join(', ')}
   - coords: the room's door (where it meets the corridor), or its centre if no door is visible
   - bounds: { x, y, width, height } bounding box of the room
   - description: one short sentence; accessible: boolean
3. hallways: corridor centre-line nodes at every junction, corner and dead end.
   Each has { id ("h-1"...), coords, connectedTo: [...] }. connectedTo lists adjacent hallway node ids
   AND the ids of rooms whose doors open onto that corridor point. Every room must be listed in at
   least one hallway's connectedTo so the whole floor is reachable. Hallway lines must stay inside
   corridors and never cross through rooms.
4. defaultStartId: id of the main entrance or lobby.
Respond with JSON only.`;
}

const point = { type: 'OBJECT', properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' } }, required: ['x', 'y'] };

export const FLOOR_PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    buildingType: { type: 'STRING' },
    summary: { type: 'STRING' },
    defaultStartId: { type: 'STRING' },
    rooms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          name: { type: 'STRING' },
          roomNumber: { type: 'STRING' },
          category: { type: 'STRING', enum: [...CATEGORIES] },
          coords: point,
          bounds: {
            type: 'OBJECT',
            properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' }, width: { type: 'NUMBER' }, height: { type: 'NUMBER' } },
          },
          description: { type: 'STRING' },
          accessible: { type: 'BOOLEAN' },
        },
        required: ['id', 'name', 'category', 'coords'],
      },
    },
    hallways: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          coords: point,
          label: { type: 'STRING' },
          connectedTo: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['id', 'coords', 'connectedTo'],
      },
    },
  },
  required: ['title', 'rooms', 'hallways'],
};

export interface DirectoryEntry {
  id: string;
  name: string;
  floor: string;
  category?: string;
  aliases?: string[];
}

export function wayfinderPrompt(buildingName: string, directory: DirectoryEntry[], question: string, current?: string): string {
  return `You are an indoor wayfinding concierge for "${buildingName}".
Directory of places (id, name, floor, category):
${directory.map((d) => `- ${d.id} | ${d.name} | ${d.floor} | ${d.category ?? ''}${d.aliases?.length ? ` | also: ${d.aliases.join(', ')}` : ''}`).join('\n')}
${current ? `The user is currently at: ${current}.` : 'The user has not set a starting point.'}
User question: "${question}"
Answer in at most 2 short sentences. If the user wants to go somewhere, return that place's id as
suggestedDestinationId (it must be an id from the directory). The app computes the actual route,
so do not invent distances or directions.`;
}

export const WAYFINDER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    suggestedDestinationId: { type: 'STRING' },
  },
  required: ['answer'],
};

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Calls Gemini generateContent and returns the parsed JSON response. */
export async function geminiJson<T>(opts: {
  apiKey: string;
  model?: string;
  parts: GeminiPart[];
  schema?: object;
  fetchImpl?: typeof fetch;
}): Promise<T> {
  const model = opts.model || DEFAULT_GEMINI_MODEL;
  const res = await (opts.fetchImpl ?? fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: opts.parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          ...(opts.schema ? { responseSchema: opts.schema } : {}),
        },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}). ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  const text: string = (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned an empty response.');
  return parseJsonText<T>(text);
}

/** Extracts JSON from model output, tolerating ```json fences or surrounding text. */
export function parseJsonText<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI response did not contain JSON.');
  return JSON.parse(body.slice(start, end + 1)) as T;
}

/** Splits a data URL into mime type and base64 payload. */
export function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const m = dataUrl.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
  return m ? { mimeType: m[1], data: m[2] } : { mimeType: 'image/jpeg', data: dataUrl };
}
