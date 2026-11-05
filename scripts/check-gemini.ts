/**
 * Live Gemini check. Sends a real floor plan image and a wayfinding question
 * to Gemini with the server-side key, then confirms the result becomes a fully
 * routable floor. Never prints the key.
 *
 *   GEMINI_API_KEY=... npm run check:gemini
 *   (or run the "Gemini live check" GitHub Action, which uses a repo secret)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_GEMINI_MODEL,
  FLOOR_PLAN_SCHEMA,
  WAYFINDER_SCHEMA,
  floorPlanPrompt,
  geminiJson,
  wayfinderPrompt,
  type FloorNavPlan,
} from '../src/shared/gemini';
import { draftToFloor, floorNavToDraft } from '../src/lib/floorPlanImport';
import { findRoute } from '../src/lib/routing';
import { buildDirectory } from '../src/lib/assistant';
import type { Building } from '../src/lib/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Add it to .env.local or the environment.');
  process.exit(2);
}

const image = fs.readFileSync(path.join(root, 'e2e/fixtures/helix-plan.png')).toString('base64');
const expectedRooms = ['Engineering Pod A', 'Boardroom Atlas', 'WC', 'Focus Pods', 'UX Studio', 'Server', 'Lifts', 'Bistro', 'Training', 'Lobby'];

async function main() {
  console.log(`Model: ${model}`);

  let t = Date.now();
  const plan = await geminiJson<FloorNavPlan>({
    apiKey: apiKey!,
    model,
    parts: [{ inline_data: { mime_type: 'image/png', data: image } }, { text: floorPlanPrompt('Office') }],
    schema: FLOOR_PLAN_SCHEMA,
  });
  console.log(`1. Floor plan analysis: OK in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  console.log(`   ${plan.rooms?.length ?? 0} rooms, ${plan.hallways?.length ?? 0} hallway nodes, title "${plan.title}"`);
  const names = (plan.rooms ?? []).map((r) => r.name.toLowerCase());
  const found = expectedRooms.filter((e) => names.some((n) => n.includes(e.toLowerCase())));
  console.log(`   Recognised ${found.length}/${expectedRooms.length} labelled rooms: ${found.join(', ')}`);

  const draft = floorNavToDraft(plan);
  const empty: Building = { id: 'live', name: 'Live check', floors: [], nodes: [], edges: [] };
  const part = draftToFloor(draft, empty, { floorName: 'Floor 1', level: 1, widthMetres: 65, aspectRatio: 780 / 750, floorId: 'live-f1' });
  const building: Building = { ...empty, floors: [part.floor], nodes: part.nodes, edges: part.edges };
  const places = building.nodes.filter((n) => n.kind !== 'corridor');
  let ok = 0;
  let total = 0;
  for (const a of places) for (const b of places) {
    if (a.id === b.id) continue;
    total++;
    if (findRoute(building, { fromId: a.id, toId: b.id, options: { accessible: false } }).ok) ok++;
  }
  console.log(`2. Converted to a routable floor: ${ok}/${total} place pairs reachable`);

  t = Date.now();
  const lobby = places.find((p) => /lobby|reception/i.test(p.label ?? ''));
  const answer = await geminiJson<{ answer: string; suggestedDestinationId?: string }>({
    apiKey: apiKey!,
    model,
    parts: [{ text: wayfinderPrompt('Live check', buildDirectory(building), 'Where is the boardroom?', lobby?.label) }],
    schema: WAYFINDER_SCHEMA,
  });
  const dest = building.nodes.find((n) => n.id === answer.suggestedDestinationId);
  console.log(`3. Assistant: OK in ${((Date.now() - t) / 1000).toFixed(1)} s -> "${answer.answer}"`);
  console.log(`   Suggested destination: ${dest?.label ?? '(none or invalid id)'}`);

  const pass = found.length >= 7 && ok / Math.max(1, total) >= 0.9 && !!dest;
  console.log(pass ? '\nLIVE GEMINI CHECK PASSED' : '\nLIVE GEMINI CHECK COMPLETED WITH WARNINGS (see above)');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  const msg = String(e instanceof Error ? e.message : e).replaceAll(apiKey!, '***');
  console.error(`LIVE GEMINI CHECK FAILED: ${msg}`);
  process.exit(1);
});
