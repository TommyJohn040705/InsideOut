import { expect, it } from 'vitest';
import { createExtractQueue } from '../server/extractQueue';

it('retries a floor after quota errors instead of failing it, and fails real errors', async () => {
  let calls = 0;
  const q = createExtractQueue(async (id) => {
    calls++;
    if (id === 'a' && calls < 3) throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}');
    if (id === 'b') throw new Error('No such import');
    return 7;
  }, { gapMs: 1, firstWaitMs: 5, maxWaitMs: 10 });
  q.enqueue(['a', 'b', 'c']);
  for (let i = 0; i < 200 && q.status().running; i++) await new Promise((r) => setTimeout(r, 10));
  const s = q.status();
  expect(s.done).toEqual(['a', 'c']);
  expect(Object.keys(s.failed)).toEqual(['b']);
  expect(calls).toBe(5); // a: 2 quota errors + success, b once, c once
});
