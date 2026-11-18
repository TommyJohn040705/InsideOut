// Builds the outdoor walking graph from data-sources/osm/uw-campus-paths.json.
// Run after fetchOsmPaths.mjs:  node scripts/campus/buildPaths.mjs -> src/data/campus/paths.json
// Nodes are OSM nodes (shared nodes = real junctions); edges follow OSM ways exactly.
import { readFileSync, writeFileSync } from 'node:fs';
const osm = JSON.parse(readFileSync('data-sources/osm/uw-campus-paths.json', 'utf8'));
const entrances = JSON.parse(readFileSync('src/data/campus/entrances.json', 'utf8'));

// Keep the network within ~400 m of any campus building entrance.
const lng = entrances.map((e) => e.position[0]), lat = entrances.map((e) => e.position[1]);
const pad = 0.004;
const box = { w: Math.min(...lng) - pad * 1.4, e: Math.max(...lng) + pad * 1.4, s: Math.min(...lat) - pad, n: Math.max(...lat) + pad };
const inBox = (p) => p.lon >= box.w && p.lon <= box.e && p.lat >= box.s && p.lat <= box.n;

const index = new Map(); // osm node id -> graph index
const nodes = [];
const edges = []; // [a, b, kind] kind: 0 walkway, 1 steps (not step-free), 2 indoor corridor or bridge
const node = (id, p) => {
  if (!index.has(id)) { index.set(id, nodes.length); nodes.push([+p.lon.toFixed(7), +p.lat.toFixed(7)]); }
  return index.get(id);
};
let ways = 0;
for (const w of osm.elements) {
  if (w.type !== 'way' || !w.geometry || w.geometry.length !== w.nodes.length) continue;
  const t = w.tags || {};
  const kind = t.highway === 'steps' || t.wheelchair === 'no' ? 1 : t.highway === 'corridor' || t.indoor === 'yes' || t.bridge === 'yes' && t.covered === 'yes' ? 2 : 0;
  let used = false;
  for (let i = 1; i < w.nodes.length; i++) {
    const p = w.geometry[i - 1], q = w.geometry[i];
    if (!inBox(p) && !inBox(q)) continue;
    edges.push([node(w.nodes[i - 1], p), node(w.nodes[i], q), kind]);
    used = true;
  }
  if (used) ways++;
}
// Entrances that are themselves a node of the walking network (drawn on a footway in OSM).
const onNetwork = {};
for (const e of entrances) {
  const m = e.id.match(/^osm-node-(\d+)$/);
  if (m && index.has(Number(m[1]))) onNetwork[e.id] = index.get(Number(m[1]));
}
const out = {
  source: 'OpenStreetMap', license: 'OpenStreetMap contributors, ODbL 1.0', fetchedAt: osm.fetchedAt,
  validation: 'unreviewed: OSM geometry, no route has been walked',
  ways, nodes, edges, entranceNodes: onNetwork,
};
writeFileSync('src/data/campus/paths.json', JSON.stringify(out));
console.log(`${ways} ways, ${nodes.length} nodes, ${edges.length} edges, ${Object.keys(onNetwork).length}/${entrances.length} entrances on the network`);
