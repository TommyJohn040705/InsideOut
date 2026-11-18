import { expect, it } from 'vitest';
import { matchFile } from '../src/campus/bulkMatch';

it('matches Plant Operations filenames exactly, including shared Village 1 drawing sets', () => {
  const dc = matchFile('037DC_02FLR.pdf');
  expect(dc.confidence).toBe('exact');
  expect(dc.targets.map((t) => [t.building.id, t.floorCode])).toEqual([['DC', '02']]);
  const v1 = matchFile('downloads/020V1_E123_01FLR.pdf');
  expect(v1.confidence).toBe('exact');
  expect(v1.targets.map((t) => t.building.id).sort()).toEqual(['V1E1', 'V1E2', 'V1E3']);
  const rev = matchFile('025REV_EH_02FLR.pdf');
  expect(rev.targets[0].building.id).toBe('REV');
  expect(rev.targets[0].floor?.wing).toBe('EH');
});

it('only guesses from other names, and never matches off-map buildings', () => {
  expect(matchFile('MC_3.pdf').confidence).toBe('guessed');
  expect(matchFile('MC_3.pdf').targets[0].floorCode).toBe('03');
  expect(matchFile('047ARC_01FLR.pdf').confidence).toBe('none'); // Cambridge, not on the map
  expect(matchFile('holiday photo.jpg').confidence).toBe('none');
});
