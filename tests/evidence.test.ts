import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVIDENCE, dedupeEvidence, searchEvidence, type EvidenceRecord } from '../src/campus/evidenceIndex';
import evidenceJson from '../src/data/campus/evidenceDestinations.json';

const first = (q: string) => searchEvidence(q)[0];
const recs = (evidenceJson as unknown as { records: EvidenceRecord[] }).records;

describe('evidence destinations (handoff section 13)', () => {
  it('imports all 159 handoff rows plus the planned residence, with no duplicates', () => {
    expect(recs).toHaveLength(160);
    expect(EVIDENCE.duplicates).toHaveLength(0);
    const kinds: Record<string, number> = {};
    for (const r of recs) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    expect(kinds).toMatchObject({ food_service: 28, administrative_service: 1, lab_or_facility: 29, professional_office: 23, washroom: 53, multi_faith: 11, library_directory: 3 });
  });

  it('every record is search-only, unverified geometry, unknown accessibility, with a source', () => {
    for (const r of recs) {
      expect(r.geometry_status).toBe('not_verified');
      expect(r.routing_status).toBe('search_only');
      expect(r.accessible).toBe('unknown');
      expect(r.source_url).toMatch(/^https:\/\/([a-z-]+\.)*uwaterloo\.ca\//);
      expect(r.source_checked_on).toBe('2026-11-14');
      expect(r).not.toHaveProperty('coords');
    }
  });

  it('Anita Layton -> MC 6516 with a source link', () => {
    const h = first('Anita Layton');
    expect([h.rec.building_code, h.rec.room_number, h.rec.person]).toEqual(['MC', '6516', 'Anita Layton']);
    expect(h.rec.source_url).toContain('applied-mathematics');
  });

  it('Rapid Prototyping Centre -> E5 2002, linked to the existing E5 room', () => {
    const h = first('Rapid Prototyping Centre');
    expect(h.rec.room_number).toBe('2002');
    expect(h.e5Room).toEqual({ id: 'e5-2002', name: 'Rapid Prototyping Centre (RPC)', nameConflict: false });
  });

  it('RoboHub -> PSE 1339, research space without unsupervised public entry', () => {
    const h = first('RoboHub');
    expect(h.rec.room_number).toBe('1339');
    expect(h.accessLabel).toMatch(/no unsupervised public entry/);
  });

  it('QNC B709 -> TEM lab with a restricted warning, basement floor', () => {
    const h = first('QNC B709');
    expect(h.rec.display_name).toMatch(/Transmission Electron Microscopy/);
    expect(h.rec.floor).toBe(-1);
    expect(h.accessLabel).toMatch(/^Restricted lab/);
  });

  it('MFCF -> MC 3017 help centre first; MC 3007 labelled course restricted', () => {
    expect(first('MFCF').rec.room_number).toBe('3017');
    expect(first('MC 3007').accessLabel).toMatch(/^Course-restricted/);
  });

  it('washroom E5 -> 1902 and 3902, never marked accessible', () => {
    const hs = searchEvidence('washroom E5');
    expect(hs.map((h) => h.rec.room_number).sort()).toEqual(['1902', '3902']);
    for (const h of hs) { expect(h.rec.accessible).toBe('unknown'); expect(h.accessLabel).toMatch(/wheelchair access unknown/); }
  });

  it('prayer room E5 -> E5 3051, and no access code anywhere in the data', () => {
    const h = first('prayer room E5');
    expect(h.rec.room_number).toBe('3051');
    expect(h.e5Room?.nameConflict).toBe(true); // E5 map calls it "Room E5-3051": flagged, not overwritten
    const raw = JSON.stringify(evidenceJson);
    expect(raw).not.toMatch(/\bcode\s*[:#]?\s*\d{3,}/i);
    expect(raw).not.toMatch(/\b(door|keypad|access)\s*code\b(?!s)/i);
  });

  it('DC Bytes -> closed, sorted after open places', () => {
    expect(first('DC Bytes').rec.operational_status).toBe('closed');
    const cafes = searchEvidence('cafe', 50);
    expect(cafes[cafes.length - 1].rec.display_name).toBe('DC Bytes');
  });

  it('a 2025 question about Juan Moreno-Cruz says the 2025 office is not verified', () => {
    const h = first('2025 office for Juan Moreno-Cruz');
    expect(h.rec.room_number).toBe('4257');
    expect(h.historicalNote).toMatch(/^2025 office not verified/);
    expect(first('Juan Moreno-Cruz').historicalNote).toBeNull();
  });

  it('New Residence Building is planned, not open, and not linked to a building', () => {
    const h = first('New Residence Building');
    expect(h.rec.operational_status).toBe('planned');
    expect(h.rec.notes).toMatch(/2027/);
    expect(h.building).toBeNull();
  });

  it('source conflicts are flagged for review, not merged', () => {
    expect(recs.find((r) => r.building_code === 'E3' && r.room_number === '2313')?.review_required).toBe(true);
    expect(recs.find((r) => r.building_code === 'SLC' && r.room_number === '3252/3254')?.review_required).toBe(true);
  });

  it('a bare building code stays a building search', () => {
    expect(searchEvidence('E5')).toEqual([]);
    expect(searchEvidence('DC')).toEqual([]);
  });

  it('dedupes on building + room + kind + name', () => {
    const r = recs[0];
    const { records, duplicates } = dedupeEvidence([r, { ...r, id: 'other', display_name: r.display_name.toUpperCase() }, { ...r, id: 'x', room_number: '9999' }]);
    expect(records).toHaveLength(2);
    expect(duplicates.map((d) => d.id)).toEqual(['other']);
  });

  it('leaves the E5 room data unchanged (365 rooms, same content)', () => {
    const raw = readFileSync(new URL('../src/data/e5/rooms.json', import.meta.url), 'utf8');
    expect(JSON.parse(raw)).toHaveLength(365);
    // Hash of rooms.json at commit 2eb70db; update only for a deliberate E5 change.
    expect(createHash('sha256').update(raw.replace(/\r\n/g, '\n')).digest('hex')).toBe(E5_ROOMS_SHA256);
  });
});

const E5_ROOMS_SHA256 = 'e2a3d3c9ab685b83eef6764237bf7879d58673e62d0b78d71d03ac0ba959508b';
