// Downloads the walkable network around the main campus from OpenStreetMap (ODbL):
// footways, paths, steps, sidewalks, service roads and indoor corridors/bridges.
// Run: node scripts/campus/fetchOsmPaths.mjs   -> data-sources/osm/uw-campus-paths.json
import { writeFileSync } from 'node:fs';
const bbox = '43.458,-80.575,43.486,-80.525'; // south,west,north,east (same as CAMPUS_BOUNDS)
const query = `[out:json][timeout:120];
(
  way["highway"~"^(footway|path|pedestrian|steps|living_street|service|residential|unclassified|tertiary|secondary|cycleway|track|corridor)$"]["foot"!~"^(no|private)$"]["access"!~"^(no|private)$"](${bbox});
);
out body geom;`;
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
for (const url of endpoints) {
  try {
    const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'User-Agent': 'InsideOut-campus-nav-dev' } });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const json = await res.json();
    if (!json.elements?.length) throw new Error('empty result');
    json.fetchedAt = new Date().toISOString();
    json.source = url;
    json.license = 'OpenStreetMap contributors, ODbL 1.0';
    writeFileSync('data-sources/osm/uw-campus-paths.json', JSON.stringify(json));
    console.log(json.elements.length, 'ways from', url);
    process.exit(0);
  } catch (e) { console.error(url, String(e)); }
}
process.exit(1);
