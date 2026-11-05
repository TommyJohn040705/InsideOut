import { describe, expect, it } from 'vitest';
import { createDefaultBuildings } from '../../../data/buildings';
import { createReport, confirmReport, MAX_REPORT_LIFETIME_MS } from '../../reports';
import { docToReport, MAX_SYNC_JSON, mergeApproved, parseBuilding, reportToDoc, serializeBuilding } from '../model';

const [demo, helix] = createDefaultBuildings();

describe('sync model', () => {
  it('round-trips buildings through JSON', () => {
    const { json, droppedImages } = serializeBuilding(helix);
    expect(droppedImages).toEqual([]);
    expect(parseBuilding(json)).toEqual(helix);
    expect(parseBuilding('{"nope":1}')).toBeNull();
    expect(parseBuilding(42)).toBeNull();
  });

  it('drops oversized floor photos so documents stay under 1 MiB', () => {
    const big = { ...demo, floors: demo.floors.map((f, i) => (i === 0 ? { ...f, imageUrl: 'data:image/jpeg;base64,' + 'A'.repeat(MAX_SYNC_JSON) } : f)) };
    const { json, droppedImages } = serializeBuilding(big);
    expect(droppedImages).toEqual(['Floor 1']);
    expect(json.length).toBeLessThan(MAX_SYNC_JSON);
    expect(parseBuilding(json)!.floors[0].imageUrl).toBeUndefined();
  });

  it('maps reports to Firestore documents and back', () => {
    const r = createReport('blocked-corridor', 'f1-N30__f1-N40', 'wet floor', 1_000_000, 'demo-hall');
    const d = reportToDoc(r, 'user-1');
    expect(d).toMatchObject({ buildingId: 'demo-hall', confirmations: 1, clears: 0, authorUid: 'user-1', note: 'wet floor' });
    expect(Number.isInteger(d.createdAt)).toBe(true);
    const back = docToReport('abc', d);
    expect(back).toMatchObject({ id: 'abc', kind: 'blocked-corridor', targetId: 'f1-N30__f1-N40', note: 'wet floor' });
    expect(docToReport('x', { kind: 'nonsense', targetId: 'a' })).toBeNull();
  });

  it('caps confirmations at the lifetime the security rules allow', () => {
    let r = createReport('elevator-out', 'elevator-main', undefined, 0);
    for (let i = 0; i < 10; i++) r = confirmReport(r, 0);
    expect(r.expiresAt).toBe(MAX_REPORT_LIFETIME_MS);
  });

  it('merges approved buildings: adds new, updates newer, keeps unsaved local edits', () => {
    const edited = { ...demo, name: 'Demo Hall (edited)' };
    const approvedDemo = { id: demo.id, building: { ...demo, name: 'Demo Hall v2' }, version: 2, updatedAt: 1 };
    const approvedNew = { id: 'e7', building: { ...demo, id: 'e7', name: 'E7' }, version: 1, updatedAt: 1 };

    const a = mergeApproved([demo], [approvedDemo, approvedNew], {}, new Set());
    expect(a.buildings.map((b) => b.name)).toEqual(['Demo Hall v2', 'E7']);
    expect(a.syncedVersions).toEqual({ [demo.id]: 2, e7: 1 });

    const b = mergeApproved([edited], [approvedDemo], {}, new Set([demo.id]));
    expect(b.buildings[0].name).toBe('Demo Hall (edited)');
    expect(b.updated).toEqual([]);

    const c = mergeApproved([demo], [approvedDemo], { [demo.id]: 2 }, new Set());
    expect(c.updated).toEqual([]);
  });
});
