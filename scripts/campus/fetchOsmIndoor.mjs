// Downloads community-surveyed indoor features (rooms, corridors, stairs, doors) inside the
// University of Waterloo campus from OpenStreetMap (ODbL).
// Run: node scripts/campus/fetchOsmIndoor.mjs   -> data-sources/osm/uw-campus-indoor.json
import { writeFileSync } from 'node:fs';
const query = `[out:json][timeout:120];
area["name"="University of Waterloo"]["amenity"="university"]->.uw;
(
  way["indoor"](area.uw);
  relation["indoor"](area.uw);
  way["highway"~"^(corridor|steps|footway|elevator)$"]["level"](area.uw);
  way["highway"="corridor"](area.uw);
  node["door"]["level"](area.uw);
  node["highway"="elevator"](area.uw);
);
out body geom;`;
for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
  try {
    const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'User-Agent': 'InsideOut-campus-nav-dev' } });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const json = await res.json();
    if (!json.elements?.length) throw new Error('empty result');
    Object.assign(json, { fetchedAt: new Date().toISOString(), source: url, license: 'OpenStreetMap contributors, ODbL 1.0' });
    writeFileSync('data-sources/osm/uw-campus-indoor.json', JSON.stringify(json));
    console.log(json.elements.length, 'elements from', url);
    process.exit(0);
  } catch (e) { console.error(url, String(e)); }
}
process.exit(1);
