import { describe, expect, it } from 'vitest';
import { StepDetector } from '../src/utils/stepCounter';

// Walking at ~1.8 steps/s: vertical acceleration swings about ±2.5 m/s² around gravity, plus noise.
const walk = (seconds: number, hz = 50, stepsPerS = 1.8, amp = 2.5, noise = 0.3) => {
  const out: [number, number][] = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let i = 0; i < seconds * hz; i++) { const t = (i / hz) * 1000; out.push([t, 9.81 + amp * Math.sin(2 * Math.PI * stepsPerS * (t / 1000)) + noise * rnd()]); }
  return out;
};

describe('step detection', () => {
  it('counts about one step per stride peak while walking', () => {
    const d = new StepDetector();
    for (const [t, z] of walk(10)) d.push(t, 0.2, 0.1, z);
    expect(d.steps).toBeGreaterThanOrEqual(16);
    expect(d.steps).toBeLessThanOrEqual(20); // 18 expected
  });
  it('does not count steps while standing still (sensor noise only)', () => {
    const d = new StepDetector();
    for (const [t, z] of walk(10, 50, 1.8, 0, 0.3)) d.push(t, 0.2, 0.1, z);
    expect(d.steps).toBe(0);
  });
});
