import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

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
app.post('/api/analyze-floorplan', async (req: Request, res: Response) => {
  try {
    const { image, buildingTypeHint } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

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

    // Provide default fallback hallway nodes if AI returned empty hallways
    if (!parsedData.hallways || parsedData.hallways.length === 0) {
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
