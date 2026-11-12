import { MapCorrectionSuggestion, CorrectionIssueType, RoomPOI } from '../types/navigation';

const CORRECTIONS_STORAGE_KEY = 'floornav.corrections.v1';

export const ISSUE_TYPE_LABELS: Record<CorrectionIssueType, string> = {
  incorrect_room: 'Incorrect room location',
  missing_door: 'Missing doorway / access point',
  blocked_corridor: 'Blocked corridor / maintenance',
  elevator_outage: 'Elevator out of service',
  facility_description: 'Incorrect facility description',
  faulty_qr: 'Faulty QR checkpoint',
  other: 'General map correction',
};

export function loadSuggestions(): MapCorrectionSuggestion[] {
  try {
    const raw = localStorage.getItem(CORRECTIONS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

export function saveSuggestions(list: MapCorrectionSuggestion[]): void {
  try {
    localStorage.setItem(CORRECTIONS_STORAGE_KEY, JSON.stringify(list));
    // Server copy is the shared record; localStorage keeps it usable offline.
    fetch("/api/store/corrections", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) }).catch(() => {});
  } catch (err) {
    console.error('Failed to save suggestions:', err);
  }
}

export function createSuggestion(params: {
  type: CorrectionIssueType;
  title: string;
  description: string;
  floor: number;
  roomId?: string;
  roomNumber?: string;
  author?: string;
  proposedChanges?: MapCorrectionSuggestion['proposedChanges'];
  originalSnapshot?: MapCorrectionSuggestion['originalSnapshot'];
}): MapCorrectionSuggestion {
  const current = loadSuggestions();
  const newSug: MapCorrectionSuggestion = {
    id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: params.type,
    title: params.title.trim(),
    description: params.description.trim(),
    floor: params.floor,
    roomId: params.roomId,
    roomNumber: params.roomNumber,
    status: 'pending',
    createdAt: new Date().toISOString(),
    author: params.author?.trim() || 'FloorNav User',
    proposedChanges: params.proposedChanges,
    originalSnapshot: params.originalSnapshot,
  };

  const updated = [newSug, ...current];
  saveSuggestions(updated);
  return newSug;
}

export function approveSuggestion(
  suggestionId: string,
  reviewerNotes?: string,
  onApplyOverride?: (roomId: string, patch: Partial<RoomPOI>) => void
): MapCorrectionSuggestion | null {
  const list = loadSuggestions();
  const idx = list.findIndex((s) => s.id === suggestionId);
  if (idx === -1) return null;

  const item = { ...list[idx] };
  item.status = 'approved';
  item.reviewNotes = reviewerNotes || 'Approved by Map Administrator';
  item.reviewedAt = new Date().toISOString();

  // Apply geometry/metadata update if proposedChanges exist
  if (item.roomId && item.proposedChanges && onApplyOverride) {
    onApplyOverride(item.roomId, item.proposedChanges);
  }

  list[idx] = item;
  saveSuggestions(list);
  return item;
}

export function rejectSuggestion(suggestionId: string, reviewerNotes?: string): MapCorrectionSuggestion | null {
  const list = loadSuggestions();
  const idx = list.findIndex((s) => s.id === suggestionId);
  if (idx === -1) return null;

  const item = { ...list[idx] };
  item.status = 'rejected';
  item.reviewNotes = reviewerNotes || 'Rejected during review';
  item.reviewedAt = new Date().toISOString();

  list[idx] = item;
  saveSuggestions(list);
  return item;
}

export function revertSuggestion(
  suggestionId: string,
  onApplyOverride?: (roomId: string, patch: Partial<RoomPOI>) => void
): MapCorrectionSuggestion | null {
  const list = loadSuggestions();
  const idx = list.findIndex((s) => s.id === suggestionId);
  if (idx === -1) return null;

  const item = { ...list[idx] };
  item.status = 'reverted';
  item.reviewNotes = `Reverted on ${new Date().toLocaleDateString()}: Rollback applied to restore original geometry`;
  item.reviewedAt = new Date().toISOString();

  // Revert to originalSnapshot if available
  if (item.roomId && item.originalSnapshot && onApplyOverride) {
    onApplyOverride(item.roomId, item.originalSnapshot);
  }

  list[idx] = item;
  saveSuggestions(list);
  return item;
}

/** Pull the shared corrections log from the server into local storage (called once on start). */
export async function hydrateSuggestions(): Promise<void> {
  try {
    const r = await fetch("/api/store/corrections");
    if (!r.ok) return;
    const list = await r.json();
    if (Array.isArray(list)) localStorage.setItem(CORRECTIONS_STORAGE_KEY, JSON.stringify(list));
  } catch { /* offline: keep the local copy */ }
}
