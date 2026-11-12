import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { openStore } from './server/store';
import type { FloorImport } from './src/campus/floorImports';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Increase payload limit to support floor plan camera photos & high-res image uploads
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ limit: '35mb', extended: true }));

// Initialize Google GenAI client with required telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Helper to extract mimeType and base64 string from data URL
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      data: match[2],
    };
  }
  return {
    mimeType: 'image/jpeg',
    data: dataUrl,
  };
}

/**
 * POST /api/analyze-floorplan
 * Analyzes an uploaded or camera-captured floor plan photo using Gemini 3.8 Flash
 */
/** strict: return only what Gemini found (no placeholder hallways). Used by the floor-plan importer. */
async function analyzeFloorplan(image: string, buildingTypeHint?: string, strict = false) {
    const { mimeType, data } = parseDataUrl(image);

    const imagePart = {
      inlineData: {
        mimeType,
        data,
      },
    };

    const textPart = {
      text: `You are an expert architectural digitizer and indoor navigation GIS system.
Analyze this floor plan image with high precision.
Extract all recognizable architectural elements, rooms, corridors, exits, and points of interest to create an indoor navigable graph.

${buildingTypeHint ? `Context hint: The user indicates this building is a "${buildingTypeHint}".` : ''}

Key Requirements:
1. Title and building type (e.g. Office, Hospital, Airport, Mall, University, Residential, Museum, Hotel).
2. Summary: A helpful 2-sentence description of the building layout, wings, and key zones.
3. Rooms & Points of Interest (POIs):
   - Locate every distinct room, office, conference room, restroom (men's, women's, all-gender, accessible), elevator bank, stairwell, emergency fire exit, main entrance/lobby, cafeteria/dining, clinic/medical, store/shop, or utility area.
   - For each room, provide:
     - id: lowercase unique identifier (e.g. "room-101", "restroom-main", "elevator-bank-a")
     - name: descriptive title (e.g. "Conference Room Orion", "Restrooms (Accessible)", "Main Lobby & Check-in")
     - roomNumber: visible room number if marked on plan (e.g. "101", "2B", "Suite 400")
     - category: exactly one of: "restroom", "office", "conference", "entrance", "exit", "elevator", "stairs", "dining", "medical", "reception", "gate", "utility", "store", "other"
     - coords: { x: number (0 to 100 percentage from left), y: number (0 to 100 percentage from top) } representing the center or door location of the room.
     - bounds: optional { x, y, width, height } in percentage (0-100) if a bounding box is clearly discernible.
     - description: 1 short sentence on capacity or purpose.
     - accessible: boolean (true if wheelchair accessible, ground-level, or elevator accessible).
4. Hallways / Corridors Walkable Graph:
   - Identify main hallway intersection points and corridor waypoints.
   - Each corridor node has: { id: string (e.g. "h-1", "h-2"), coords: { x: number (0-100), y: number (0-100) }, label?: string, connectedTo: string[] }.
   - The 'connectedTo' array must contain IDs of other hallway nodes OR room POI IDs that connect directly to this corridor segment, forming a continuous walkable path network so users can navigate anywhere on the floor!
5. Identify the default entrance/starting point ID in 'defaultStartId'.

Respond in structured JSON strictly matching the requested format.`,
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Descriptive title of the floor plan' },
            buildingType: { type: Type.STRING, description: 'Type of building (Office, Hospital, etc.)' },
            summary: { type: Type.STRING, description: 'Summary of the floor layout' },
            scaleNote: { type: Type.STRING, description: 'Estimated scale notation' },
            defaultStartId: { type: Type.STRING, description: 'ID of the best default starting point' },
            rooms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  roomNumber: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    description: 'One of restroom, office, conference, entrance, exit, elevator, stairs, dining, medical, reception, gate, utility, store, other',
                  },
                  coords: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER, description: 'X percentage (0-100)' },
                      y: { type: Type.NUMBER, description: 'Y percentage (0-100)' },
                    },
                    required: ['x', 'y'],
                  },
                  description: { type: Type.STRING },
                  accessible: { type: Type.BOOLEAN },
                },
                required: ['id', 'name', 'category', 'coords'],
              },
            },
            hallways: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  coords: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER },
                    },
                    required: ['x', 'y'],
                  },
                  label: { type: Type.STRING },
                  connectedTo: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['id', 'coords', 'connectedTo'],
              },
            },
          },
          required: ['title', 'buildingType', 'summary', 'rooms', 'hallways'],
        },
      },
    });

    const text = response.text || '{}';
    const parsedData = JSON.parse(text);

    // Provide default fallback hallway nodes if AI returned empty hallways (photo flow only)
    if (!strict && (!parsedData.hallways || parsedData.hallways.length === 0)) {
      const roomCoords = parsedData.rooms?.map((r: any) => r.coords) || [];
      const avgY = roomCoords.length ? roomCoords.reduce((a: number, b: any) => a + b.y, 0) / roomCoords.length : 50;
      parsedData.hallways = [
        { id: 'h-main-w', coords: { x: 25, y: avgY }, connectedTo: ['h-main-c'] },
        { id: 'h-main-c', coords: { x: 50, y: avgY }, connectedTo: ['h-main-w', 'h-main-e'] },
        { id: 'h-main-e', coords: { x: 75, y: avgY }, connectedTo: ['h-main-c'] },
      ];
      // Attach nearest rooms to these default hallways
      for (const room of parsedData.rooms || []) {
        if (room.coords.x < 35) parsedData.hallways[0].connectedTo.push(room.id);
        else if (room.coords.x > 65) parsedData.hallways[2].connectedTo.push(room.id);
        else parsedData.hallways[1].connectedTo.push(room.id);
      }
    }

    return parsedData;
}

app.post('/api/analyze-floorplan', async (req: Request, res: Response) => {
  try {
    const { image, buildingTypeHint } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }
    const parsedData = await analyzeFloorplan(image, buildingTypeHint);
    return res.json({
      id: `floorplan-${Date.now()}`,
      imageUrl: image,
      ...parsedData,
    });
  } catch (error: any) {
    console.error('Error analyzing floor plan:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to analyze floor plan image with AI',
    });
  }
});

/**
 * POST /api/ask-wayfinder
 * Intelligent natural language wayfinder questions:
 * e.g. "Where is the nearest restroom from Room 102?", "What's the best wheelchair-friendly exit?"
 */
app.post('/api/ask-wayfinder', async (req: Request, res: Response) => {
  try {
    const { floorPlan, question, currentRoomId, allFloors } = req.body;
    if (!floorPlan || !question) {
      return res.status(400).json({ error: 'floorPlan and question are required' });
    }

    const currentRoom = currentRoomId
      ? floorPlan.rooms.find((r: any) => r.id === currentRoomId)
      : null;

    let buildingContext = '';
    if (Array.isArray(allFloors) && allFloors.length > 1) {
      const summaryList = allFloors.map((f: any) => ({
        floor: f.floorNumber,
        title: f.title,
        keyRooms: (f.rooms || [])
          .filter((r: any) => r.purposeVerification === 'verified_official_source' || r.category === 'restroom' || r.category === 'elevator' || r.category === 'entrance')
          .slice(0, 15)
          .map((r: any) => `${r.name} (${r.roomNumber || r.id}, Level ${r.floor})`)
      }));
      buildingContext = `\nMulti-floor building overview across levels:\n${JSON.stringify(summaryList, null, 2)}`;
    }

    const facts: string[] = Array.isArray(req.body.buildingFacts) ? req.body.buildingFacts.slice(0, 20) : [];
    const systemPrompt = `You are Waterloo StaffNav, the workplace companion and wayfinding assistant for University of Waterloo Engineering 5 (E5). Your users include sessional instructors, contract staff, new university employees, and facilities personnel. Help them navigate rooms and settle into their first weeks at Waterloo.
You know about:
- Classroom & podium technology (E5 3101, 3102, 2004, 3052, 6005 have Crestron touch panels, HDMI/USB-C inputs, lapel microphones in drawers; emergency AV hotline is ext. 44357).
- Workplace resources (uPrint card-tap printer in Gear Lab 2108; staff kitchenette with microwave & filtered water in Collaborative Commons 3812A on Level 3; upper lounge on Level 6).
- Building access (exterior doors lock at 19:00 on weekdays and all weekend; access via WatCard swipe at Level 2 Main Entrance facing DC or Level 1 East door; Key Control is in GSC ext. 33765).
- Indoor winter links (Level 1 North link 1808 connects directly to the E7 Atrium and food court; Level 3 overpass 3818 connects across Ring Road to Engineering 3).
- Health & Safety (AEDs located outside 1002 on L1, 2811 lobby on L2, 3101 on L3, and 5101 on L5; Emergency eyewash in Machine Shop 1101 and Lab 6005; Campus Police emergency is ext. 22222 / 519-888-4911; Plant Ops maintenance is ext. 33793).
- Transit & Parking (Waterloo ION LRT Station is 3-min walk south of E5; staff parking lots B and C adjacent).

Rules: Answer in 1-3 crisp, helpful plain sentences without markdown. E5 room numbers are 4 digits and the first digit is the floor number. If the destination is on another floor, state the floor and recommend the southeast elevators (step-free) or nearest stairs. If suggesting a room, set suggestedDestinationId to the room id (e.g. "e5-3101", "e5-2108") and suggestedFloor so the app automatically plots the route.

Current active floor: Level ${floorPlan.floorNumber || 1}.
${buildingContext}

Current Floor Directory:
${JSON.stringify(
  floorPlan.rooms.slice(0, 50).map((r: any) => ({
    id: r.id,
    name: r.name,
    roomNumber: r.roomNumber,
    category: r.category,
    floor: r.floor || floorPlan.floorNumber || 1,
    location: `approx ${Math.round(r.coords.x)}% from left, ${Math.round(r.coords.y)}% from top`,
    accessible: r.accessible,
    description: r.purpose || r.description,
  })),
  null,
  2
)}

${currentRoom ? `The user is starting from: ${currentRoom.name} (${currentRoom.roomNumber || ''}, Level ${currentRoom.floor || floorPlan.floorNumber || 1})` : ''}

${facts.length ? `Verified building facts (use these, do not contradict them):\n- ${facts.join('\n- ')}` : ''}

User Question: "${question}"

Return JSON with 'answer', 'suggestedDestinationId' (optional string), 'suggestedFloor' (optional number), 'suggestedStartId' (optional string), and 'relevantRoomIds' (array of strings).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: systemPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            suggestedDestinationId: { type: Type.STRING },
            suggestedFloor: { type: Type.NUMBER },
            suggestedStartId: { type: Type.STRING },
            relevantRoomIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['answer'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error answering wayfinder query:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to process wayfinder query',
    });
  }
});

/**
 * POST /api/lookup-room
 * Find out what a room is used for by searching the web (Gemini + Google Search grounding).
 * Body: { building: string, roomNumber?: string, text?: string, image?: dataUrl }
 * Returns a proposal the user must approve before it is saved:
 * { roomNumber, name, category, purpose, confidence, notes, sources: [{ title, url }] }
 */
const ROOM_CATEGORIES = ['classroom', 'lab', 'workshop', 'office', 'conference', 'restroom', 'elevator', 'stairs', 'entrance', 'study', 'dining', 'utility', 'other'];

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

app.post('/api/lookup-room', async (req: Request, res: Response) => {
  try {
    const { building, roomNumber, text, image } = req.body || {};
    if (!building || (!roomNumber && !text && !image)) {
      return res.status(400).json({ error: 'building plus a room number, text or image is required' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server' });
    }

    const parts: any[] = [];
    if (image) {
      const { mimeType, data } = parseDataUrl(image);
      parts.push({ inlineData: { mimeType, data } });
    }
    parts.push({
      text: `You help map rooms inside "${building}".
${image ? 'First read any room number, sign text or name visible in the attached photo.' : ''}
${roomNumber ? `Room number: ${roomNumber}.` : ''}
${text ? `What the user typed: "${text}".` : ''}

Search the web for what this room is used for (official university pages first: department pages, facility pages, classroom booking, accessibility pages).
Rules:
- Only report a purpose that a source you found actually supports. Do not guess or invent details such as seat counts, equipment or hours.
- If you find nothing reliable, set confidence to "none" and purpose to "".
- confidence is "high" if an official page names this exact room, "medium" if the evidence is indirect, "low" if weak.

Reply with ONLY a JSON object, no other text:
{"roomNumber": string, "name": string, "category": one of ${JSON.stringify(ROOM_CATEGORIES)}, "purpose": string (1-2 plain sentences), "confidence": "high"|"medium"|"low"|"none", "notes": string (what was unclear, or what the photo showed)}`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts }],
      config: { tools: [{ googleSearch: {} }] },
    });

    const parsed = extractJson(response.text || '') || {};
    const chunks: any[] = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const seen = new Set<string>();
    const sources = chunks
      .map((c) => c?.web)
      .filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
      .slice(0, 6)
      .map((w) => ({ title: w.title || w.uri, url: w.uri }));

    const category = ROOM_CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    let confidence = ['high', 'medium', 'low', 'none'].includes(parsed.confidence) ? parsed.confidence : 'low';
    // No web sources means nothing was verified, whatever the model claims.
    if (!sources.length && confidence !== 'none') confidence = 'low';

    return res.json({
      roomNumber: String(parsed.roomNumber || roomNumber || '').trim(),
      name: String(parsed.name || '').trim(),
      category,
      purpose: String(parsed.purpose || '').trim(),
      confidence,
      notes: String(parsed.notes || '').trim(),
      sources,
    });
  } catch (error: any) {
    console.error('Error looking up room:', error);
    return res.status(500).json({ error: error?.message || 'Room lookup failed' });
  }
});

/**
 * POST /api/read-sign  { image: dataUrl } -> { roomNumber, name }
 * Reads the room number and name printed on a door sign. No web search.
 */
app.post('/api/read-sign', async (req: Request, res: Response) => {
  try {
    const { image } = req.body || {};
    if (!image) return res.status(400).json({ error: 'image is required' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server' });
    const { mimeType, data } = parseDataUrl(image);
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType, data } },
        { text: 'Read the room sign in this photo. Return JSON {"roomNumber": string, "name": string}. roomNumber is only the number printed on the sign (for example "2108" or "3101A"), without the building code. Use "" for anything you cannot read. Do not guess.' },
      ] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties: { roomNumber: { type: Type.STRING }, name: { type: Type.STRING } }, required: ['roomNumber'] },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    return res.json({ roomNumber: String(parsed.roomNumber || '').replace(/^E\d+[\s-]*/i, '').trim(), name: String(parsed.name || '').trim() });
  } catch (error: any) {
    console.error('Error reading sign:', error);
    return res.status(500).json({ error: error?.message || 'Could not read the sign' });
  }
});

/**
 * POST /api/contribute
 * One entry point for anything a person adds: typed text and/or one photo.
 * Gemini sorts it into changes the person then approves:
 *   room_update  - what a room is (from a sign photo or a description)
 *   report       - a problem (elevator out, door locked, hallway blocked, maintenance, wrong info)
 *   floor_plan   - the photo is a whole floor plan / evacuation map, to be added as a new map
 * Body: { building, text?, image?, roomNumber?, rooms: [{ n: roomNumber, name }] }
 */
app.post('/api/contribute', async (req: Request, res: Response) => {
  try {
    const { building, text, image, roomNumber, rooms } = req.body || {};
    if (!text && !image) return res.status(400).json({ error: 'text or image is required' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server' });

    const directory = Array.isArray(rooms) ? rooms.slice(0, 600).map((r: any) => `${r.n}: ${r.name}`).join('\n') : '';
    const parts: any[] = [];
    if (image) { const { mimeType, data } = parseDataUrl(image); parts.push({ inlineData: { mimeType, data } }); }
    parts.push({ text: `You help staff keep the indoor map of "${building}" up to date.
${roomNumber ? `The person opened this from room ${roomNumber}.` : ''}
${text ? `They wrote: "${text}"` : 'They only sent a photo.'}
${image ? 'A photo is attached. Decide if it is (a) a room sign or the inside of a room, or (b) a whole floor plan / evacuation map.' : ''}

Room directory (number: current name):
${directory}

Turn this into a list of changes. Rules:
- room_update: what a room is or is used for. roomNumber must be a number from the directory. Match descriptions like "the machine shop" to the right number. name is a short room name, purpose is 1 sentence in plain words, category one of classroom, lab, workshop, office, conference, restroom, study, utility, elevator, stairs, other.
- report: a problem. reportType one of elevator_out, door_locked, hallway_blocked, maintenance, wrong_info, wrong_spot, other. details is a short plain description.
- floor_plan: only when the photo shows a whole floor plan or evacuation map.
- One message can contain several changes. Use only what the person said or what is visible. Never invent purposes, hours or equipment.
- If a room number is mentioned that is not in the directory, still return it; the app will say it is not on the map.
- If you cannot tell what they mean, return an empty list and explain in "message".` });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            changes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kind: { type: Type.STRING, enum: ['room_update', 'report', 'floor_plan'] },
                  roomNumber: { type: Type.STRING },
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  purpose: { type: Type.STRING },
                  reportType: { type: Type.STRING },
                  details: { type: Type.STRING },
                },
                required: ['kind'],
              },
            },
          },
          required: ['changes'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    const changes = (Array.isArray(parsed.changes) ? parsed.changes : []).slice(0, 8).map((c: any) => ({
      ...c,
      roomNumber: String(c.roomNumber || '').replace(/^E\d+[\s-]*/i, '').trim(),
    }));
    return res.json({ message: String(parsed.message || ''), changes });
  } catch (error: any) {
    console.error('Error in contribute:', error);
    return res.status(500).json({ error: error?.message || 'Could not process this update' });
  }
});

/**
 * POST /api/transcribe
 * Audio transcription using Gemini
 */
app.post('/api/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', language } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'audioBase64 is required' });
    }

    const parsed = audioBase64.startsWith('data:')
      ? parseDataUrl(audioBase64)
      : { mimeType: mimeType || 'audio/webm', data: audioBase64 };

    const audioPart = {
      inlineData: {
        mimeType: parsed.mimeType || mimeType || 'audio/webm',
        data: parsed.data,
      },
    };

    const promptText = `Transcribe this recording word for word. Room numbers are 4 digits, like 3101. Return only the transcript text.${language ? ` The speaker language is likely ${language}.` : ''}`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: { parts: [audioPart, { text: promptText }] },
      });
    } catch (modelErr: any) {
      console.warn('Falling back to gemini-3.8-flash for transcription:', modelErr?.message);
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts: [audioPart, { text: promptText }] },
      });
    }

    const transcript = (response?.text || '').trim();
    return res.json({
      success: true,
      transcript,
    });
  } catch (error: any) {
    console.error('Error in /api/transcribe:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to transcribe audio',
      transcript: '',
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint reporting server & Gemini readiness
 */
app.get('/api/health', (_req: Request, res: Response) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  return res.json({
    status: 'ok',
    geminiConfigured,
    model: 'gemini-3.8-flash',
    service: 'InsideOut API',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/recognize-sign
 * Camera-assisted wayfinding: recognizes door signs, elevator plaques, directional signs, or QR codes.
 */
app.post('/api/recognize-sign', async (req: Request, res: Response) => {
  try {
    const { image, candidateRooms, floorHint } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server' });
    }

    const { mimeType, data } = parseDataUrl(image);

    const promptText = `You are an expert OCR and indoor wayfinding vision system for the University of Waterloo Engineering 5 (E5) building.
Analyze this photo taken inside the building by a person walking.
The photo may depict:
- A room number door plaque (e.g., "3101", "2108", "E5 2002", "1101")
- A directional corridor sign with room ranges or arrows (e.g., "Rooms 3001-3050 ->", "Elevators / Stairs")
- An elevator bank call plaque (e.g., "Elevator 1801 / Southeast Bank", "Level 2")
- A washroom door sign (e.g., "All-Gender Washroom", "Men", "Women")
- A QR code or printed barcode checkpoint (e.g., "E5-L2-ATRIUM", "E5-3101")
${floorHint ? `Current active floor context: Level ${floorHint}.` : ''}

Extract with high fidelity:
1. rawText: All visible text in the photo.
2. detectedType: Exactly one of "room_number", "directional_sign", "elevator_label", "restroom_label", "qr_code", "general_text".
3. extractedRoomNumber: Just the 4-digit room number if visible (e.g., "3101", "2108", "2002"), stripped of "E5" or prefix. Empty string if not found.
4. extractedName: The room or facility name if printed (e.g. "Department Lecture Hall", "Gear Computer Lab", "Rapid Prototyping").
5. qrCode: Any QR payload or text like "E5-L2-..." or "QR: ..." if present.
6. confidenceScore: Number from 0.0 to 1.0 indicating how clear and unambiguous the reading is.

Return strictly valid JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data } },
          { text: promptText },
        ],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rawText: { type: Type.STRING },
            detectedType: {
              type: Type.STRING,
              description: 'One of room_number, directional_sign, elevator_label, restroom_label, qr_code, general_text',
            },
            extractedRoomNumber: { type: Type.STRING },
            extractedName: { type: Type.STRING },
            qrCode: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
          },
          required: ['rawText', 'detectedType', 'extractedRoomNumber', 'confidenceScore'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const rawNumber = String(parsed.extractedRoomNumber || '')
      .replace(/^E\d+[\s-]*/i, '')
      .trim();
    const cleanQr = String(parsed.qrCode || '').trim();

    // Match candidate against candidateRooms if provided
    const roomsList: any[] = Array.isArray(candidateRooms) ? candidateRooms : [];
    const matches: any[] = [];

    if (rawNumber) {
      for (const r of roomsList) {
        const num = String(r.roomNumber || '').toUpperCase();
        if (num === rawNumber.toUpperCase()) {
          matches.push({
            roomId: r.id,
            roomNumber: r.roomNumber,
            name: r.name,
            floor: r.floor,
            category: r.category,
            coords: r.coords,
            confidence: 'high',
            score: 98,
            reason: `Exact room number match (${r.roomNumber})`,
          });
        } else if (num.startsWith(rawNumber.toUpperCase()) || rawNumber.toUpperCase().startsWith(num)) {
          matches.push({
            roomId: r.id,
            roomNumber: r.roomNumber,
            name: r.name,
            floor: r.floor,
            category: r.category,
            coords: r.coords,
            confidence: 'medium',
            score: 75,
            reason: `Partial room number match (${r.roomNumber})`,
          });
        }
      }
    }

    // Name keyword matching
    if (parsed.extractedName && matches.length === 0) {
      const q = parsed.extractedName.toLowerCase();
      for (const r of roomsList) {
        if (r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase())) {
          matches.push({
            roomId: r.id,
            roomNumber: r.roomNumber,
            name: r.name,
            floor: r.floor,
            category: r.category,
            coords: r.coords,
            confidence: 'medium',
            score: 70,
            reason: `Matches sign title "${parsed.extractedName}"`,
          });
        }
      }
    }

    const isUniqueMatch = matches.length === 1 && matches[0].confidence === 'high';

    return res.json({
      rawText: parsed.rawText || '',
      detectedType: parsed.detectedType || 'general_text',
      extractedRoomNumber: rawNumber,
      extractedName: parsed.extractedName || '',
      qrCode: cleanQr,
      confidenceScore: parsed.confidenceScore || 0.5,
      isUniqueMatch,
      candidates: matches.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Error in /api/recognize-sign:', error);
    return res.status(500).json({ error: error?.message || 'Failed to recognize sign photo' });
  }
});

/**
 * POST /api/assistant-chat
 * Structured tool-calling agent for natural indoor wayfinding
 */
app.post('/api/assistant-chat', async (req: Request, res: Response) => {
  try {
    const { message, currentState, buildingFacts, directory } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on server' });
    }

    const toolDeclarations = [
      {
        name: 'getCurrentIndoorPosition',
        description: 'Get the user current indoor position, active floor, and current starting room.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'setPositionFromCheckpoint',
        description: 'Update the user position using a verified QR checkpoint code (e.g. E5-L2-ATRIUM, E5-L2-MAIN-ENTRANCE).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            checkpointCode: { type: Type.STRING, description: 'QR checkpoint code, e.g. E5-L2-MAIN-ENTRANCE or E5-3101' },
          },
          required: ['checkpointCode'],
        },
      },
      {
        name: 'setManualPosition',
        description: 'Set the user starting location to a specific room in the building.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            roomNumberOrId: { type: Type.STRING, description: 'Room number (e.g. "2108", "2811") or room ID' },
            floor: { type: Type.NUMBER, description: 'Optional floor number (1-6)' },
          },
          required: ['roomNumberOrId'],
        },
      },
      {
        name: 'findRoom',
        description: 'Search the building directory for a room by number, name, or keywords.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Room number or keyword, e.g. "3101" or "Machine Shop"' },
            floor: { type: Type.NUMBER, description: 'Optional floor filter (1-6)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'findNearestFacility',
        description: 'Find the nearest facility (restroom, elevator, stairs, entrance) from the user current location.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, description: 'One of restroom, elevator, stairs, entrance, dining, lab, workshop' },
            accessibleOnly: { type: Type.BOOLEAN, description: 'Require wheelchair barrier-free accessible facilities' },
          },
          required: ['category'],
        },
      },
      {
        name: 'selectDestination',
        description: 'Select a room as the target destination to plan a route.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            roomNumberOrId: { type: Type.STRING, description: 'Target destination room number (e.g. "3101") or ID' },
          },
          required: ['roomNumberOrId'],
        },
      },
      {
        name: 'calculateIndoorRoute',
        description: 'Calculate an indoor route to a destination and start guidance.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            destinationRoomNumberOrId: { type: Type.STRING, description: 'Destination room number (e.g. "3101")' },
            startRoomNumberOrId: { type: Type.STRING, description: 'Optional starting room number or ID' },
            accessibleOnly: { type: Type.BOOLEAN, description: 'Whether to require elevators only (no stairs)' },
          },
          required: ['destinationRoomNumberOrId'],
        },
      },
      {
        name: 'rerouteFromCurrentPosition',
        description: 'Recalculate the navigation route when user took a wrong hallway or deviated from path.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            currentLocationHint: { type: Type.STRING, description: 'Description or room near where the user is now' },
            newDestination: { type: Type.STRING, description: 'Optional new destination room number' },
          },
        },
      },
      {
        name: 'getCurrentNavigationStep',
        description: 'Get details about current turn-by-turn guidance step, remaining meters, and next instruction.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'showFloor',
        description: 'Switch the map view to display a specific floor level (1 to 6).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            floorNumber: { type: Type.NUMBER, description: 'Floor level 1 through 6' },
          },
          required: ['floorNumber'],
        },
      },
      {
        name: 'getRoomInformation',
        description: 'Get verified purpose, department, accessibility, and details for a room.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            roomNumberOrId: { type: Type.STRING, description: 'Room number (e.g. "3101") or ID' },
          },
          required: ['roomNumberOrId'],
        },
      },
      {
        name: 'reportMapIssue',
        description: 'Report an issue with the map such as a locked door, elevator outage, or faulty checkpoint.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            issueType: { type: Type.STRING, description: 'elevator_outage, door_locked, hallway_blocked, wrong_info, faulty_qr, other' },
            roomNumberOrId: { type: Type.STRING, description: 'Associated room number or ID' },
            details: { type: Type.STRING, description: 'Description of the problem' },
          },
          required: ['issueType', 'details'],
        },
      },
    ];

    const systemPrompt = `You are FloorNav AI, the trusted indoor navigation assistant for University of Waterloo Engineering 5 (E5).
You have real-time access to the interactive map via structured tool calls.
When a user asks you to navigate, locate a room, find facilities, switch floors, or report an issue, CALL THE RELEVANT TOOL.
Rules:
- E5 has 6 floors: Level 1 (Sedra SDC & Machine Shop), Level 2 (Main Ring Road Entrance, Gear Lab 2108, Rapid Proto 2002), Level 3 (Classrooms 3101/3102, E3 Bridge 3818), Level 4 (ECE), Level 5 (Dean Suite), Level 6 (SYDE/BME).
- E5 room numbers are 4 digits where the first digit is the floor number (e.g. 2108 is Floor 2, 3101 is Floor 3).
- Vertical circulation: Southeast elevator bank connects all 6 floors and is wheelchair-accessible.
- Do NOT invent rooms, hallways, elevators, or coordinates. Use the directory and call the tools.
- Keep conversational answers concise, professional, and clear (1-3 plain sentences, no markdown).

Current App State:
${JSON.stringify(currentState || {}, null, 2)}

Verified E5 Building Facts:
${Array.isArray(buildingFacts) ? buildingFacts.slice(0, 15).join('\n') : ''}

Directory sample:
${Array.isArray(directory) ? directory.slice(0, 60).map((r: any) => `${r.roomNumber || r.id}: ${r.name} (L${r.floor})`).join(', ') : ''}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser request: "${message}"` }] },
      ],
      config: {
        tools: [{ functionDeclarations: toolDeclarations as any }],
      },
    });

    const candidate = response.candidates?.[0];
    const functionCalls = candidate?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall) || [];
    const textPart = candidate?.content?.parts?.find((p: any) => p.text)?.text || '';

    const toolCalls = functionCalls.map((fc: any) => ({
      name: fc.name,
      args: fc.args || {},
    }));

    return res.json({
      answer: textPart || (toolCalls.length > 0 ? 'Executing request on the map...' : 'How can I help you navigate E5?'),
      toolCalls,
    });
  } catch (error: any) {
    console.error('Error in /api/assistant-chat:', error?.message || error);
    return res.status(503).json({
      error: error?.message || 'Assistant service unavailable',
      offline: true,
    });
  }
});


/* ---------------- Persistent store: imported floor plans and corrections ---------------- */
const store = openStore(path.resolve(__dirname, 'data'));
// Uploaded drawings may be university-owned: never cached publicly, never indexed.
app.use('/uploads', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('X-Robots-Tag', 'noindex'); next(); }, express.static(store.uploadsDir));
app.use('/uploads', (_req: Request, res: Response) => res.status(404).json({ error: 'No such file' }));

const STORE_KEYS = new Set(['corrections', 'roomOverrides', 'reports']);
app.get('/api/store/:key', (req: Request, res: Response) => {
  if (!STORE_KEYS.has(req.params.key)) return res.status(404).json({ error: 'Unknown store key' });
  return res.json(store.read().kv[req.params.key] ?? null);
});
app.put('/api/store/:key', (req: Request, res: Response) => {
  if (!STORE_KEYS.has(req.params.key)) return res.status(404).json({ error: 'Unknown store key' });
  if (req.body == null || typeof req.body !== 'object') return res.status(400).json({ error: 'Expected JSON' });
  store.update((d) => { d.kv[req.params.key] = req.body; });
  return res.json({ ok: true });
});

// PDFs a UW account holder saved into data-sources/plantops/pdfs (gitignored) for bulk import.
const PLANTOPS_DIR = path.resolve(__dirname, 'data-sources', 'plantops', 'pdfs');
app.get('/api/plantops-folder', (_req: Request, res: Response) => {
  let names: string[] = [];
  try { names = fs.readdirSync(PLANTOPS_DIR).filter((n) => /\.(pdf|png|jpe?g|svg|webp)$/i.test(n)); } catch { /* folder missing */ }
  return res.json(names.map((name) => ({ name, size: fs.statSync(path.join(PLANTOPS_DIR, name)).size })));
});
// Saving PDFs into the folder from a plantops.uwaterloo.ca tab where the user is signed in.
// Only non-restricted manifest files for buildings on the map are accepted; CORS is limited to that origin.
const manifestRows: { filename: string; restricted: boolean; url: string }[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data-sources', 'wayfinder', 'uw_floor_plans_manifest.json'), 'utf8'));
const campusBuildings: { footprint: unknown; floors: { filename: string }[] }[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'src', 'data', 'campus', 'buildings.json'), 'utf8'));
const onMapFiles = new Set(campusBuildings.filter((b) => b.footprint).flatMap((b) => b.floors.map((x) => x.filename)));
const downloadable = new Map(manifestRows.filter((r) => !r.restricted && onMapFiles.has(r.filename)).map((r) => [r.filename, r.url]));
const plantopsCors = (req: Request, res: Response, next: () => void) => {
  if (req.headers.origin === 'https://plantops.uwaterloo.ca') {
    res.set('Access-Control-Allow-Origin', 'https://plantops.uwaterloo.ca');
    res.set('Access-Control-Allow-Methods', 'GET, PUT');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
};
app.options('/api/plantops-wanted', plantopsCors);
app.get('/api/plantops-wanted', plantopsCors, (_req: Request, res: Response) => {
  const have = new Set(fs.existsSync(PLANTOPS_DIR) ? fs.readdirSync(PLANTOPS_DIR) : []);
  return res.json([...downloadable].filter(([n]) => !have.has(n)).map(([filename, url]) => ({ filename, url })));
});
app.options('/api/plantops-folder/:name', plantopsCors);
app.put('/api/plantops-folder/:name', plantopsCors, express.raw({ type: 'application/pdf', limit: '60mb' }), (req: Request, res: Response) => {
  const name = path.basename(req.params.name);
  if (!downloadable.has(name)) return res.status(403).json({ error: 'Only non-restricted Plant Operations plans of buildings on the map are accepted' });
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.subarray(0, 5).toString() !== '%PDF-') return res.status(400).json({ error: 'Not a PDF (maybe a login page)' });
  fs.mkdirSync(PLANTOPS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PLANTOPS_DIR, name), body);
  return res.json({ ok: true, bytes: body.length });
});
app.get('/api/plantops-folder/:name', (req: Request, res: Response) => {
  const name = path.basename(req.params.name);
  const file = path.join(PLANTOPS_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No such file' });
  res.set('Cache-Control', 'private, no-store');
  return res.sendFile(file);
});

app.get('/api/floor-imports', (_req: Request, res: Response) => res.json(store.read().floorImports));

app.post('/api/floor-imports', (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.buildingId || !b.floorCode || !Number.isFinite(Number(b.floorNumber))) return res.status(400).json({ error: 'buildingId, floorCode and floorNumber are required' });
    if (!String(b.authorization || '').trim()) return res.status(400).json({ error: 'Say who authorized use of this document' });
    if (!b.fileDataUrl || !b.imageDataUrl || !Array.isArray(b.imageSize)) return res.status(400).json({ error: 'The file and its rendered image are required' });
    const id = `${String(b.buildingId).replace(/\W/g, '')}-${String(b.floorCode).replace(/\W/g, '')}-${Date.now().toString(36)}`;
    const file = store.saveUpload(id, b.fileDataUrl);
    // Rasters are used as-is; PDFs and SVGs get the PNG the browser rendered (Gemini needs a raster).
    const image = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mime) ? file : store.saveUpload(`${id}-page1`, b.imageDataUrl);
    const rec: FloorImport = {
      id, buildingId: String(b.buildingId), floorCode: String(b.floorCode), floorNumber: Number(b.floorNumber),
      manifestFilename: b.manifestFilename || null, restricted: Boolean(b.restricted), authorization: String(b.authorization).trim(),
      sourceName: String(b.fileName || file.name), sourceMime: file.mime,
      fileUrl: `/uploads/${file.name}`, imageUrl: `/uploads/${image.name}`, imageSize: [Number(b.imageSize[0]), Number(b.imageSize[1])],
      uploadedAt: new Date().toISOString(),
      pdfLabels: Array.isArray(b.pdfLabels) ? b.pdfLabels.slice(0, 2000) : [],
      extraction: null, rooms: [], hallways: [], controlPoints: [], reviewed: false, published: false,
    };
    store.update((d) => { d.floorImports.push(rec); });
    return res.json(rec);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Import failed' });
  }
});

app.post('/api/floor-imports/:id/extract', async (req: Request, res: Response) => {
  const rec = store.read().floorImports.find((f) => f.id === req.params.id);
  if (!rec) return res.status(404).json({ error: 'No such import' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server, so AI extraction is unavailable. You can still add rooms by hand.' });
  try {
    const hint = `University of Waterloo building ${rec.buildingId}, floor ${rec.floorCode}. Room labels printed on the drawing: ${rec.pdfLabels.slice(0, 150).map((l) => l.text).join(', ')}`;
    const out = await analyzeFloorplan(store.readUploadDataUrl(rec.imageUrl.replace('/uploads/', '')), hint, true);
    const updated = store.update((d) => {
      const f = d.floorImports.find((x) => x.id === rec.id)!;
      f.rooms = (out.rooms || []).map((r: any) => ({ ...r, id: `${rec.id}-${r.id}`, floor: rec.floorNumber, purposeVerification: 'unverified_drawing_only' }));
      const rid = new Map((out.rooms || []).map((r: any) => [r.id, `${rec.id}-${r.id}`]));
      f.hallways = (out.hallways || []).map((h: any) => ({ ...h, id: `${rec.id}-${h.id}`, connectedTo: (h.connectedTo || []).map((t: string) => rid.get(t) || `${rec.id}-${t}`) }));
      f.extraction = { model: 'gemini-3.8-flash', at: new Date().toISOString(), title: out.title, summary: out.summary };
      f.reviewed = false;
      return f;
    });
    return res.json(updated);
  } catch (e: any) {
    console.error('extract failed', e);
    return res.status(500).json({ error: e?.message || 'Extraction failed' });
  }
});

app.patch('/api/floor-imports/:id', (req: Request, res: Response) => {
  const b = req.body || {};
  const out = store.update((d) => {
    const f = d.floorImports.find((x) => x.id === req.params.id);
    if (!f) return null;
    if (Array.isArray(b.rooms)) { f.rooms = b.rooms; f.reviewed = false; }
    if (Array.isArray(b.hallways)) { f.hallways = b.hallways; f.reviewed = false; }
    if (Array.isArray(b.controlPoints)) { f.controlPoints = b.controlPoints; f.alignmentFrom = typeof b.alignmentFrom === 'string' ? b.alignmentFrom : undefined; f.reviewed = false; }
    if (typeof b.reviewed === 'boolean') { f.reviewed = b.reviewed; f.reviewedAt = b.reviewed ? new Date().toISOString() : undefined; }
    // Published = shown in the app (indoor navigator); the map overlay additionally needs control points.
    if (typeof b.published === 'boolean') f.published = b.published;
    return f;
  });
  return out ? res.json(out) : res.status(404).json({ error: 'No such import' });
});

app.delete('/api/floor-imports/:id', (req: Request, res: Response) => {
  const gone = store.update((d) => {
    const f = d.floorImports.find((x) => x.id === req.params.id);
    d.floorImports = d.floorImports.filter((x) => x.id !== req.params.id);
    return f;
  });
  if (!gone) return res.status(404).json({ error: 'No such import' });
  store.removeUpload(gone.fileUrl.replace('/uploads/', ''));
  if (gone.imageUrl !== gone.fileUrl) store.removeUpload(gone.imageUrl.replace('/uploads/', ''));
  return res.json({ ok: true });
});

// Production static file serving or Dev Vite middleware
async function setupServer() {
  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Indoor Navigation Server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
