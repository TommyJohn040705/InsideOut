import type { Building, Report } from '../types';
import type { ApprovedBuilding, MapProposal, SyncUser } from './model';

export type Unsubscribe = () => void;

/**
 * What the app needs from a shared backend. Implemented by FirestoreBackend;
 * when Firebase is not configured the app keeps using localStorage only.
 */
export interface SyncBackend {
  readonly projectId: string;
  onUser(cb: (u: SyncUser | null) => void): Unsubscribe;
  subscribeReports(buildingId: string, cb: (reports: Report[]) => void, onError?: (e: Error) => void): Unsubscribe;
  addReport(report: Report): Promise<string>;
  confirmReport(id: string): Promise<void>;
  clearReport(id: string): Promise<void>;
  subscribeBuildings(cb: (buildings: ApprovedBuilding[]) => void, onError?: (e: Error) => void): Unsubscribe;
  proposeMapUpdate(building: Building, note: string, baseVersion: number): Promise<{ id: string; droppedImages: string[] }>;
  /** Admins see all pending proposals; others see their own. */
  subscribeProposals(cb: (p: MapProposal[]) => void, onError?: (e: Error) => void): Unsubscribe;
  approveProposal(p: MapProposal): Promise<number>;
  rejectProposal(id: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}
