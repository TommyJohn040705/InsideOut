/**
 * Step detection from the phone's motion sensor (DeviceMotion), so the indoor navigator's dot moves
 * as you actually walk instead of at a fixed speed. A step is a peak in the smoothed acceleration
 * magnitude that rises clearly above the recent average, at least MIN_GAP_MS after the last one.
 * Pure detector plus a thin browser hook.
 */
export const STEP_M = 0.7; // average adult step; shortcut: one length for everyone, calibrate per user if needed
const MIN_GAP_MS = 280, RISE = 1.1; // m/s² above the running mean

export class StepDetector {
  private mean = 9.81; private smooth = 9.81; private above = false; private lastStep = -Infinity;
  steps = 0;
  /** Feed one sample (ms, acceleration including gravity, m/s²); true when it completes a step. */
  push(t: number, ax: number, ay: number, az: number): boolean {
    const m = Math.hypot(ax, ay, az);
    this.smooth += (m - this.smooth) * 0.35;  // light low-pass against jitter
    this.mean += (m - this.mean) * 0.02;      // slow running mean (gravity + posture)
    if (!this.above && this.smooth > this.mean + RISE) {
      this.above = true;
      if (t - this.lastStep >= MIN_GAP_MS) { this.lastStep = t; this.steps++; return true; }
    } else if (this.above && this.smooth < this.mean + RISE * 0.4) this.above = false;
    return false;
  }
}

/**
 * Starts counting steps; calls onStep for each. Must be called from a tap on iPhone (motion
 * permission). Resolves to a stop function, or null when the phone has no motion sensor or permission
 * was refused.
 */
export async function startStepCounter(onStep: () => void): Promise<(() => void) | null> {
  const DM = (globalThis as any).DeviceMotionEvent;
  if (!DM) return null;
  if (typeof DM.requestPermission === 'function') {
    try { if ((await DM.requestPermission()) !== 'granted') return null; } catch { return null; }
  }
  const d = new StepDetector();
  const h = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (a?.x != null && a.y != null && a.z != null && d.push(e.timeStamp, a.x, a.y, a.z)) onStep();
  };
  window.addEventListener('devicemotion', h);
  return () => window.removeEventListener('devicemotion', h);
}
