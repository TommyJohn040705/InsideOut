import { useEffect, useState } from 'react';
import type { SyncBackend } from './backend';
import type { SyncUser } from './model';
import { createSyncBackend } from './config';

export type SyncStatus = 'off' | 'connecting' | 'live' | 'error';

/** Connects to Firestore if Firebase is configured; otherwise stays 'off' (local only). */
export function useSync(): { backend: SyncBackend | null; status: SyncStatus; user: SyncUser | null; error?: string } {
  const [backend, setBackend] = useState<SyncBackend | null>(null);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [user, setUser] = useState<SyncUser | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    createSyncBackend()
      .then((b) => {
        if (cancelled) return;
        setBackend(b);
        setStatus(b ? 'live' : 'off');
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => (backend ? backend.onUser(setUser) : undefined), [backend]);

  return { backend, status, user, error };
}

const VERSIONS_KEY = 'insideout.syncedVersions.v1';
const DIRTY_KEY = 'insideout.dirtyBuildings.v1';

export function loadSyncedVersions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function saveSyncedVersions(v: Record<string, number>) {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}

export function loadDirty(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DIRTY_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveDirty(ids: string[]) {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}
