import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  increment,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { confirmReport as confirmLocal } from '../reports';
import type { Building, Report } from '../types';
import type { SyncBackend, Unsubscribe } from './backend';
import { docToReport, parseBuilding, reportToDoc, serializeBuilding, type ApprovedBuilding, type MapProposal, type SyncUser } from './model';

export interface FirestoreBackendOptions {
  /** Connect to local emulators (auth 9099, firestore 8080) for development and tests. */
  emulator?: { host: string; firestorePort: number; authPort: number };
  appName?: string;
}

export class FirestoreBackend implements SyncBackend {
  readonly projectId: string;
  readonly app: FirebaseApp;
  readonly db: Firestore;
  readonly auth: Auth;
  private currentUser: SyncUser | null = null;
  private ready: Promise<void>;

  constructor(config: FirebaseOptions, opts: FirestoreBackendOptions = {}) {
    this.projectId = config.projectId ?? 'unknown';
    this.app = initializeApp(config, opts.appName);
    this.db = initializeFirestore(this.app, { ignoreUndefinedProperties: true });
    this.auth = getAuth(this.app);
    if (opts.emulator) {
      connectFirestoreEmulator(this.db, opts.emulator.host, opts.emulator.firestorePort);
      connectAuthEmulator(this.auth, `http://${opts.emulator.host}:${opts.emulator.authPort}`, { disableWarnings: true });
    }
    // Everyone gets an anonymous identity so reports can be attributed and rate-limited by rules.
    // The listener stays on so signing out of Google falls back to an anonymous identity.
    let settled = false;
    this.ready = new Promise((resolve, reject) => {
      onAuthStateChanged(this.auth, (u) => {
        if (u) {
          if (!settled) {
            settled = true;
            resolve();
          }
        } else {
          signInAnonymously(this.auth).catch((e) => {
            if (!settled) {
              settled = true;
              reject(e);
            }
          });
        }
      });
    });
  }

  /** Resolves once a (possibly anonymous) user is signed in. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  private async uid(): Promise<string> {
    await this.ready;
    const u = this.auth.currentUser;
    if (!u) throw new Error('Not signed in to Firebase.');
    return u.uid;
  }

  onUser(cb: (u: SyncUser | null) => void): Unsubscribe {
    return onAuthStateChanged(this.auth, async (u) => {
      if (!u) {
        this.currentUser = null;
        return cb(null);
      }
      let isAdmin = false;
      try {
        isAdmin = (await getDoc(doc(this.db, 'admins', u.uid))).exists();
      } catch {
        isAdmin = false;
      }
      this.currentUser = { uid: u.uid, isAnonymous: u.isAnonymous, email: u.email ?? undefined, isAdmin };
      cb(this.currentUser);
    });
  }

  subscribeReports(buildingId: string, cb: (reports: Report[]) => void, onError?: (e: Error) => void): Unsubscribe {
    const q = query(collection(this.db, 'reports'), where('buildingId', '==', buildingId), where('expiresAt', '>', Date.now()));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => docToReport(d.id, d.data())).filter((r): r is Report => r !== null)),
      (e) => onError?.(e),
    );
  }

  async addReport(report: Report): Promise<string> {
    const uid = await this.uid();
    const ref = await addDoc(collection(this.db, 'reports'), reportToDoc(report, uid));
    return ref.id;
  }

  async confirmReport(id: string): Promise<void> {
    await this.uid();
    const ref = doc(this.db, 'reports', id);
    await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const r = snap.exists() ? docToReport(id, snap.data()) : null;
      if (!r) throw new Error('Report not found.');
      const next = confirmLocal(r);
      tx.update(ref, { confirmations: next.confirmations, expiresAt: Math.round(next.expiresAt) });
    });
  }

  async clearReport(id: string): Promise<void> {
    await this.uid();
    await updateDoc(doc(this.db, 'reports', id), { clears: increment(1) });
  }

  subscribeBuildings(cb: (buildings: ApprovedBuilding[]) => void, onError?: (e: Error) => void): Unsubscribe {
    return onSnapshot(
      collection(this.db, 'buildings'),
      (snap) =>
        cb(
          snap.docs
            .map((d) => {
              const data = d.data();
              const building = parseBuilding(data.json);
              if (!building) return null;
              const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
              return { id: d.id, building: { ...building, id: d.id }, version: Number(data.version) || 0, updatedAt };
            })
            .filter((b): b is ApprovedBuilding => b !== null),
        ),
      (e) => onError?.(e),
    );
  }

  async proposeMapUpdate(building: Building, note: string, baseVersion: number): Promise<{ id: string; droppedImages: string[] }> {
    const uid = await this.uid();
    const { json, droppedImages } = serializeBuilding(building);
    const ref = await addDoc(collection(this.db, 'mapProposals'), {
      buildingId: building.id,
      buildingName: building.name.slice(0, 200),
      json,
      note: note.trim().slice(0, 500) || undefined,
      status: 'pending',
      authorUid: uid,
      createdAt: Date.now(),
      baseVersion,
    });
    return { id: ref.id, droppedImages };
  }

  subscribeProposals(cb: (p: MapProposal[]) => void, onError?: (e: Error) => void): Unsubscribe {
    const col = collection(this.db, 'mapProposals');
    const q = this.currentUser?.isAdmin
      ? query(col, where('status', '==', 'pending'), orderBy('createdAt', 'desc'))
      : query(col, where('authorUid', '==', this.auth.currentUser?.uid ?? '-'));
    return onSnapshot(
      q,
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              buildingId: x.buildingId,
              buildingName: x.buildingName,
              building: parseBuilding(x.json),
              note: x.note,
              status: x.status,
              authorUid: x.authorUid,
              createdAt: Number(x.createdAt) || 0,
              baseVersion: Number(x.baseVersion) || 0,
            } satisfies MapProposal;
          }),
        ),
      (e) => onError?.(e),
    );
  }

  async approveProposal(p: MapProposal): Promise<number> {
    const uid = await this.uid();
    if (!p.building) throw new Error('This proposal does not contain a valid building.');
    const current = await getDoc(doc(this.db, 'buildings', p.buildingId));
    const version = (Number(current.data()?.version) || 0) + 1;
    const { json } = serializeBuilding({ ...p.building, id: p.buildingId });
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, 'buildings', p.buildingId), {
      name: p.buildingName,
      json,
      version,
      updatedAt: serverTimestamp(),
      approvedBy: uid,
      proposalId: p.id,
    });
    batch.update(doc(this.db, 'mapProposals', p.id), { status: 'approved', reviewedBy: uid, reviewedAt: serverTimestamp() });
    await batch.commit();
    return version;
  }

  async rejectProposal(id: string): Promise<void> {
    const uid = await this.uid();
    await updateDoc(doc(this.db, 'mapProposals', id), { status: 'rejected', reviewedBy: uid, reviewedAt: serverTimestamp() });
  }

  async signInWithGoogle(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  async signOut(): Promise<void> {
    await fbSignOut(this.auth);
  }
}
