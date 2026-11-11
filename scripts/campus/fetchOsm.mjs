// Downloads University of Waterloo main-campus buildings and entrances from OpenStreetMap (ODbL).
// Run: node scripts/campus/fetchOsm.mjs   -> data-sources/osm/uw-campus-osm.json
import { writeFileSync } from 'node:fs';
const query = `[out:json][timeout:90];
area["name"="University of Waterloo"]["amenity"="university"]->.uw;
(
  way["building"](area.uw);
  relation["building"](area.uw);
  node["entrance"](area.uw);
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
    writeFileSync('data-sources/osm/uw-campus-osm.json', JSON.stringify(json));
    console.log(json.elements.length, 'elements from', url);
    process.exit(0);
  } catch (e) { console.error(url, String(e)); }
}
process.exit(1);
