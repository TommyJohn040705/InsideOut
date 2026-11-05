/**
 * Pure helpers for syncing InsideOut data through Firestore. Kept free of the
 * Firebase SDK so they are unit-tested without a network.
 */
import { validateBuilding } from '../editor';
import type { Building, Report } from '../types';

/** Firestore documents are limited to 1 MiB; keep JSON comfortably below. */
export const MAX_SYNC_JSON = 900_000;

export interface ApprovedBuilding {
  id: string;
  building: Building;
  version: number;
  updatedAt: number;
}

export interface MapProposal {
  id: string;
  buildingId: string;
  buildingName: string;
  building: Building | null;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  authorUid: string;
  createdAt: number;
  baseVersion: number;
}

export interface SyncUser {
  uid: string;
  isAnonymous: boolean;
  email?: string;
  isAdmin: boolean;
}

/**
 * Serialises a building for Firestore. Floor background images stored as
 * large data URLs are dropped (they belong in Cloud Storage) so the document
 * stays under the size limit; the map itself is kept.
 */
export function serializeBuilding(building: Building): { json: string; droppedImages: string[] } {
  const droppedImages: string[] = [];
  let b = building;
  let json = JSON.stringify(b);
  if (json.length > MAX_SYNC_JSON) {
    b = {
      ...b,
      floors: b.floors.map((f) => {
        if (f.imageUrl?.startsWith('data:') && f.imageUrl.length > 20_000) {
          droppedImages.push(f.name);
          return { ...f, imageUrl: undefined };
        }
        return f;
      }),
    };
    json = JSON.stringify(b);
  }
  if (json.length > MAX_SYNC_JSON) {
    throw new Error(`This building is too large to sync (${Math.round(json.length / 1000)} KB). Remove some floors or images.`);
  }
  return { json, droppedImages };
}

export function parseBuilding(json: unknown): Building | null {
  if (typeof json !== 'string') return null;
  try {
    const b = JSON.parse(json);
    return validateBuilding(b) ? b : null;
  } catch {
    return null;
  }
}

export function reportToDoc(r: Report, uid: string): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    buildingId: r.buildingId ?? '',
    kind: r.kind,
    targetId: r.targetId,
    createdAt: Math.round(r.createdAt),
    expiresAt: Math.round(r.expiresAt),
    confirmations: 1,
    clears: 0,
    authorUid: uid,
  };
  if (r.note) doc.note = r.note.slice(0, 280);
  return doc;
}

export function docToReport(id: string, d: Record<string, unknown>): Report | null {
  const kinds = ['blocked-corridor', 'elevator-out', 'stairs-closed'];
  if (!kinds.includes(d.kind as string) || typeof d.targetId !== 'string') return null;
  const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    id,
    buildingId: typeof d.buildingId === 'string' ? d.buildingId : undefined,
    kind: d.kind as Report['kind'],
    targetId: d.targetId,
    note: typeof d.note === 'string' ? d.note : undefined,
    createdAt: num(d.createdAt),
    expiresAt: num(d.expiresAt),
    confirmations: num(d.confirmations, 1),
    clears: num(d.clears),
  };
}

/**
 * Applies approved buildings from the server to the local list.
 * - New approved buildings are added.
 * - An approved version replaces the local copy if it is newer than the
 *   version this device last synced, unless the user has unsaved local edits.
 * Returns the merged list and the new synced-version map.
 */
export function mergeApproved(
  local: Building[],
  approved: ApprovedBuilding[],
  syncedVersions: Record<string, number>,
  dirtyIds: Set<string>,
): { buildings: Building[]; syncedVersions: Record<string, number>; updated: string[] } {
  const versions = { ...syncedVersions };
  const updated: string[] = [];
  const out = [...local];
  for (const a of approved) {
    const i = out.findIndex((b) => b.id === a.id);
    const seen = versions[a.id] ?? 0;
    if (i < 0) {
      out.push(a.building);
      versions[a.id] = a.version;
      updated.push(a.id);
    } else if (a.version > seen && !dirtyIds.has(a.id)) {
      out[i] = a.building;
      versions[a.id] = a.version;
      updated.push(a.id);
    }
  }
  return { buildings: out, syncedVersions: versions, updated };
}
