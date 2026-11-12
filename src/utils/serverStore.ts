/** Server copy of lists the app also keeps in localStorage (see server.ts /api/store/:key). */
export type StoreKey = 'corrections' | 'roomOverrides' | 'reports';

export async function pullStore<T>(key: StoreKey): Promise<T | null> {
  try {
    const r = await fetch(`/api/store/${key}`);
    return r.ok ? ((await r.json()) as T | null) : null;
  } catch { return null; }
}

export function pushStore(key: StoreKey, value: unknown): void {
  fetch(`/api/store/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
    .catch(() => { /* offline: localStorage still has it, next save syncs */ });
}
