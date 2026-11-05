import { describe, expect, it } from 'vitest';
import { createSampleBuilding } from '../../data/sampleBuilding';
import { addFloor, addNode, connectNodes, deleteEdge, deleteFloor, deleteNode, moveNode, updateNode, validateBuilding } from '../editor';
import { findRoute } from '../routing';

describe('floor plan editor operations', () => {
  it('adds a room, connects it and routes to it', () => {
    let b = createSampleBuilding();
    const added = addNode(b, 'f2', 'room', 58, 28, 'Server Room');
    b = added.building;
    expect(b.floors.find((f) => f.id === 'f2')!.rooms.some((r) => r.nodeId === added.node.id)).toBe(true);
    expect(findRoute(b, { fromId: 'f2-N-10', toId: added.node.id, options: { accessible: false } }).ok).toBe(false);
    b = connectNodes(b, 'f2-S55', added.node.id).building;
    const r = findRoute(b, { fromId: 'f2-N-10', toId: added.node.id, options: { accessible: false } });
    expect(r.ok).toBe(true);
  });

  it('moves a node and its outline together', () => {
    const b = moveNode(createSampleBuilding(), 'f1-N-10', 12, 5);
    const n = b.nodes.find((x) => x.id === 'f1-N-10')!;
    expect([n.x, n.y]).toEqual([12, 5]);
    const poly = b.floors[0].rooms.find((r) => r.nodeId === 'f1-N-10')!.polygon;
    expect(poly[0]).toEqual([7.5, 1]);
  });

  it('renames and deletes nodes, removing their edges', () => {
    let b = updateNode(createSampleBuilding(), 'f1-N-10', { label: 'Dean Office' });
    expect(b.nodes.find((n) => n.id === 'f1-N-10')!.label).toBe('Dean Office');
    b = deleteNode(b, 'f1-N-10');
    expect(b.nodes.some((n) => n.id === 'f1-N-10')).toBe(false);
    expect(b.edges.some((e) => e.from === 'f1-N-10' || e.to === 'f1-N-10')).toBe(false);
    expect(validateBuilding(b)).toBe(true);
  });

  it('only joins floors through matching stairs or elevators', () => {
    let b = createSampleBuilding();
    const { building, floorId } = addFloor(b, 'Floor 4');
    b = building;
    expect(b.floors.find((f) => f.id === floorId)!.level).toBe(4);
    const elev = addNode(b, floorId, 'elevator', 34, 15);
    b = elev.building;
    expect(connectNodes(b, 'f3-stW', elev.node.id).error).toMatch(/Only stairs/);
    const res = connectNodes(b, 'f3-elev', elev.node.id);
    expect(res.error).toBeUndefined();
    b = res.building;
    expect(b.nodes.find((n) => n.id === elev.node.id)!.shaftId).toBe('elevator-main');
    expect(connectNodes(b, 'f3-elev', elev.node.id).error).toMatch(/already/);
  });

  it('deletes edges and floors', () => {
    let b = deleteEdge(createSampleBuilding(), 'f1-N30__f1-N40');
    expect(b.edges.some((e) => e.id === 'f1-N30__f1-N40')).toBe(false);
    b = deleteFloor(b, 'f3');
    expect(b.nodes.some((n) => n.floorId === 'f3')).toBe(false);
    expect(validateBuilding(b)).toBe(true);
  });

  it('validates building JSON', () => {
    expect(validateBuilding(createSampleBuilding())).toBe(true);
    expect(validateBuilding({})).toBe(false);
    expect(validateBuilding({ floors: [], nodes: [], edges: [] })).toBe(false);
  });
});
