import { expect, it } from 'vitest';
import { parseRooms } from '../server/plantOpsSheet';

it('turns Gemini [y, x] 0-1000 labels into percent coords and drops bad or duplicate ones', () => {
  const rooms = parseRooms({ rooms: [
    { n: '1301', c: 'classroom', p: [783, 332] },
    { n: '1301', c: 'classroom', p: [100, 100] }, // duplicate label
    { n: '1350A', name: 'Lecture hall', c: 'lecture', p: [796, 153] }, // unknown category
    { n: '', c: 'office', p: [1, 1] },
    { n: '1999', c: 'office', p: [1200, 5] }, // off the grid
  ] });
  expect(rooms).toHaveLength(2);
  expect(rooms[0]).toMatchObject({ roomNumber: '1301', category: 'classroom', coords: { x: 33.2, y: 78.3 }, name: 'Room 1301' });
  expect(rooms[1]).toMatchObject({ roomNumber: '1350A', category: 'other', name: 'Lecture hall' });
});
