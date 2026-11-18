import { describe, expect, it } from 'vitest';
import { readTripWords } from '../src/utils/tellInWords';
import type { RoomPOI } from '../src/types/navigation';

const rooms = ['2416', '5338', '1101A', 'B703'].map((n) => ({ id: n, roomNumber: n, name: `Room ${n}`, category: 'office', coords: { x: 0, y: 0 } } as RoomPOI));

describe('tell us in words', () => {
  it('takes the first room as the start and the second as the destination', () => {
    const w = readTripWords("I'm at 2416 and I need room 5338", rooms);
    expect([w.start?.id, w.end?.id, w.message]).toEqual(['2416', '5338', undefined]);
  });

  it('reads a single room as the destination, with letters and building codes', () => {
    expect(readTripWords('where is E5 1101a', rooms).end?.id).toBe('1101A');
    expect(readTripWords('QNC B703 please', rooms).end?.id).toBe('B703');
  });

  it('understands "nearest washroom from 2416"', () => {
    const w = readTripWords('nearest washroom from 2416', rooms);
    expect([w.nearest, w.start?.id]).toEqual(['restroom', '2416']);
  });

  it('says so when a room is not in this building, or nothing was understood', () => {
    expect(readTripWords('I need 9999', rooms).message).toMatch(/9999/);
    expect(readTripWords('hello', rooms).message).toMatch(/room number/);
  });
});
