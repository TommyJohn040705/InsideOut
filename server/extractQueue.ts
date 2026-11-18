/**
 * Background room reading for many floors on the Gemini free tier: one floor at a time, a pause
 * between calls, and when Google answers "quota exceeded" or "busy" the same floor is retried
 * after a growing wait instead of being marked failed. Lives in memory; posting the queue again
 * after a server restart resumes with the floors that still have no rooms.
 */
export interface QueueStatus {
  running: boolean;
  total: number;
  done: string[];
  failed: Record<string, string>;
  current: string | null;
  waitingUntil: string | null;
  lastMessage: string | null;
}

const RETRYABLE = /\b(429|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED)\b/;

export function createExtractQueue(extractOne: (id: string) => Promise<number>, opts: { gapMs?: number; firstWaitMs?: number; maxWaitMs?: number } = {}) {
  const gapMs = opts.gapMs ?? 20_000, firstWaitMs = opts.firstWaitMs ?? 60_000, maxWaitMs = opts.maxWaitMs ?? 30 * 60_000;
  let queue: string[] = [];
  let stopRequested = false;
  const status: QueueStatus = { running: false, total: 0, done: [], failed: {}, current: null, waitingUntil: null, lastMessage: null };
  const sleep = async (ms: number) => {
    status.waitingUntil = new Date(Date.now() + ms).toISOString();
    const end = Date.now() + ms;
    while (Date.now() < end && !stopRequested) await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
    status.waitingUntil = null;
  };

  async function loop() {
    status.running = true;
    let wait = firstWaitMs;
    while (queue.length && !stopRequested) {
      const id = queue[0];
      status.current = id;
      try {
        const rooms = await extractOne(id);
        queue.shift();
        status.done.push(id);
        status.lastMessage = `${id}: ${rooms} rooms`;
        wait = firstWaitMs;
        if (queue.length) await sleep(gapMs);
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (RETRYABLE.test(msg)) {
          status.lastMessage = `${id}: Gemini quota or load limit, retrying after ${Math.round(wait / 60000)} min`;
          await sleep(wait);
          wait = Math.min(wait * 2, maxWaitMs);
        } else {
          queue.shift();
          status.failed[id] = msg.slice(0, 300);
          status.lastMessage = `${id}: failed (${msg.slice(0, 120)})`;
        }
      }
    }
    status.current = null;
    status.running = false;
    stopRequested = false;
  }

  return {
    status: () => ({ ...status, remaining: queue.length }),
    /** Adds floors (skipping ones already queued) and starts the loop if idle. */
    enqueue(ids: string[]) {
      const add = ids.filter((id) => !queue.includes(id));
      queue.push(...add);
      status.total += add.length;
      if (!status.running) void loop();
      return add.length;
    },
    stop() { stopRequested = true; queue = []; },
  };
}
