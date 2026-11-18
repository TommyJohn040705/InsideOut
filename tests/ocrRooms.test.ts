import { describe, expect, it } from 'vitest';
import { roomsFromOcr, type OcrWord } from '../src/campus/ocrRooms';

const w = (text: string, x: number, y: number, confidence = 90): OcrWord => ({ text, confidence, x, y, h: 1 });

describe('rooms from OCR words', () => {
  const many = Array.from({ length: 12 }, (_, i) => w(`17${10 + i}`, 10 + i * 5, 50));

  it('keeps room numbers for this floor and drops other numbers, low confidence and duplicates', () => {
    const rooms = roomsFromOcr([...many, w('2405', 5, 5), w('1730', 90, 90, 40), w('1710', 11, 50, 70), w('NORTH', 1, 1)], '01', 1, 'f');
    expect(rooms.map((r) => r.roomNumber)).toEqual(many.map((m) => m.text));
  });

  it('puts back a lost first digit when the floor uses 4-digit numbers', () => {
    expect(roomsFromOcr([...many, w('776D', 70, 20)], '01', 1, 'f').some((r) => r.roomNumber === '1776D')).toBe(true);
  });

  it('types a room only from the drawing label next to it', () => {
    const rooms = roomsFromOcr([...many, w('1823', 80, 80), w('ELV', 80, 82), w('1941', 30, 30), w('M', 31, 31), w('1950', 60, 10)], '01', 1, 'f');
    const by = (n: string) => rooms.find((r) => r.roomNumber === n)!;
    expect([by('1823').category, by('1941').category, by('1950').category]).toEqual(['elevator', 'restroom', 'other']);
  });

  it('reads basement numbers that start with B or 0', () => {
    expect(roomsFromOcr([w('B703', 10, 10), w('0812', 20, 20), w('1812', 30, 30)], 'B1', 0, 'f').map((r) => r.roomNumber)).toEqual(['B703', '0812']);
  });
});

describe('cut-off reads', () => {
  it('drops a 3-digit read that already starts with the floor digit on a 4-digit floor', () => {
    const many = Array.from({ length: 12 }, (_, i) => w(`17${10 + i}`, 10 + i * 5, 50));
    expect(roomsFromOcr([...many, w('172', 70, 20)], '01', 1, 'f').some((r) => r.roomNumber === '1172' || r.roomNumber === '172')).toBe(false);
  });
});

describe('elevator labels', () => {
  it('makes an elevator from an ELV label with no number beside it, once per label', () => {
    const many = Array.from({ length: 12 }, (_, i) => w(`17${10 + i}`, 10 + i * 5, 80));
    const rooms = roomsFromOcr([...many, w('ELV', 40, 20), w('ELV', 40.5, 20.5)], '01', 1, 'f');
    expect(rooms.filter((r) => r.category === 'elevator').map((r) => r.coords)).toEqual([{ x: 40, y: 20 }]);
  });
});
