import { describe, expect, it, vi } from 'vitest';
import { loadFirebaseConfig } from '../config';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('loadFirebaseConfig', () => {
  it('returns null when no host provides a config (local-only mode)', async () => {
    const f = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(await loadFirebaseConfig(f as unknown as typeof fetch)).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('uses Firebase Hosting init.json first', async () => {
    const f = vi.fn(async () => json({ apiKey: 'k', projectId: 'p' }));
    expect(await loadFirebaseConfig(f as unknown as typeof fetch)).toEqual({ apiKey: 'k', projectId: 'p' });
    expect(f).toHaveBeenCalledWith('/__/firebase/init.json');
  });

  it('falls back to the App Hosting server endpoint', async () => {
    const f = vi.fn(async (url: string) => (url.includes('init.json') ? json({}, 404) : json({ apiKey: 'k2', projectId: 'p2' })));
    expect(await loadFirebaseConfig(f as unknown as typeof fetch)).toMatchObject({ projectId: 'p2' });
  });
});
