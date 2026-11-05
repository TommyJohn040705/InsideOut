// Integration tests for Firestore sync + security rules, run against the local
// Firebase emulators:  npm run test:firebase
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDoc, collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { FirestoreBackend } from '../src/lib/sync/firestoreBackend';
import { createReport } from '../src/lib/reports';
import { createSampleBuilding } from '../src/data/sampleBuilding';
import type { ApprovedBuilding, MapProposal } from '../src/lib/sync/model';
import type { Report } from '../src/lib/types';

const PROJECT = 'demo-insideout';
const HOST = '127.0.0.1';
const emulator = { host: HOST, firestorePort: 8080, authPort: 9099 };
const config = { apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` };

let user: FirestoreBackend;
let other: FirestoreBackend;
let admin: FirestoreBackend;

async function clearFirestore() {
  await fetch(`http://${HOST}:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

/** Writes a document bypassing security rules (emulator "owner" access). */
async function seedAdmin(uid: string) {
  const res = await fetch(`http://${HOST}:8080/v1/projects/${PROJECT}/databases/(default)/documents/admins?documentId=${uid}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {} }),
  });
  if (!res.ok) throw new Error(`seed failed ${res.status}`);
}

function waitFor<T>(subscribe: (cb: (v: T) => void) => () => void, pred: (v: T) => boolean, ms = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('timed out waiting for snapshot'));
    }, ms);
    const unsub = subscribe((v) => {
      if (pred(v)) {
        clearTimeout(timer);
        setTimeout(() => unsub(), 0);
        resolve(v);
      }
    });
  });
}

const denied = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow(/PERMISSION_DENIED|permission/i);
};

beforeAll(async () => {
  await clearFirestore();
  user = new FirestoreBackend(config, { emulator, appName: 'user' });
  other = new FirestoreBackend(config, { emulator, appName: 'other' });
  admin = new FirestoreBackend(config, { emulator, appName: 'admin' });
  await Promise.all([user.whenReady(), other.whenReady(), admin.whenReady()]);
  await seedAdmin(admin.auth.currentUser!.uid);
  // Refresh admin status now that the admins/{uid} doc exists.
  await new Promise<void>((resolve) => {
    const stop = admin.onUser((u) => {
      if (u?.isAdmin) {
        stop();
        resolve();
      }
    });
  });
});

afterAll(async () => {
  await clearFirestore();
});

describe('reports sync (Waze-style)', () => {
  it('a report from one user reaches another user live', async () => {
    const seen = waitFor<Report[]>((cb) => other.subscribeReports('demo-hall', cb), (rs) => rs.some((r) => r.note === 'flooded'));
    const id = await user.addReport(createReport('blocked-corridor', 'f1-N30__f1-N40', 'flooded', Date.now(), 'demo-hall'));
    const reports = await seen;
    expect(reports.find((r) => r.id === id)).toMatchObject({ kind: 'blocked-corridor', confirmations: 1, clears: 0 });
  });

  it('other users can confirm and clear, and everyone sees the counts', async () => {
    const id = await user.addReport(createReport('elevator-out', 'elevator-main', undefined, Date.now(), 'demo-hall'));
    await other.confirmReport(id);
    await other.clearReport(id);
    const rs = await waitFor<Report[]>((cb) => user.subscribeReports('demo-hall', cb), (x) => x.some((r) => r.id === id && r.clears === 1));
    expect(rs.find((r) => r.id === id)).toMatchObject({ confirmations: 2, clears: 1 });
  });

  it('only shows reports for the selected building', async () => {
    await user.addReport(createReport('blocked-corridor', 'x', 'other building', Date.now(), 'helix-hub'));
    const rs = await waitFor<Report[]>((cb) => user.subscribeReports('demo-hall', cb), () => true);
    expect(rs.some((r) => r.note === 'other building')).toBe(false);
  });

  it('rules reject tampering', async () => {
    const id = await user.addReport(createReport('blocked-corridor', 'f1-N10__f1-N20', 'x', Date.now(), 'demo-hall'));
    const ref = doc(other.db, 'reports', id);
    await denied(updateDoc(ref, { confirmations: 50 }));
    await denied(updateDoc(ref, { targetId: 'something-else' }));
    await denied(updateDoc(ref, { clears: 5 }));
    await denied(deleteDoc(ref));
    const base = { buildingId: 'demo-hall', kind: 'blocked-corridor', targetId: 't', createdAt: Date.now(), clears: 0 };
    await denied(addDoc(collection(other.db, 'reports'), { ...base, expiresAt: Date.now() + 1000, confirmations: 99, authorUid: other.auth.currentUser!.uid }));
    await denied(addDoc(collection(other.db, 'reports'), { ...base, expiresAt: Date.now() + 1000, confirmations: 1, authorUid: 'someone-else' }));
    await denied(addDoc(collection(other.db, 'reports'), { ...base, expiresAt: Date.now() + 365 * 86400000, confirmations: 1, authorUid: other.auth.currentUser!.uid }));
    await denied(addDoc(collection(other.db, 'reports'), { ...base, kind: 'fire', expiresAt: Date.now() + 1000, confirmations: 1, authorUid: other.auth.currentUser!.uid }));
  });
});

describe('approved map updates', () => {
  it('non-admins cannot publish maps or make themselves admin', async () => {
    await denied(setDoc(doc(user.db, 'buildings', 'demo-hall'), { name: 'x', json: '{}', version: 1 }));
    await denied(setDoc(doc(user.db, 'admins', user.auth.currentUser!.uid), {}));
  });

  it('a proposal stays private until an admin approves it, then syncs to everyone', async () => {
    const edited = createSampleBuilding();
    edited.nodes = edited.nodes.map((n) => (n.id === 'f1-N-10' ? { ...n, label: 'Dean Office' } : n));
    const { id } = await user.proposeMapUpdate(edited, 'Room 101 is now the Dean Office', 0);

    // The author sees their own pending proposal; another user cannot read it.
    const mine = await waitFor<MapProposal[]>((cb) => user.subscribeProposals(cb), (ps) => ps.some((p) => p.id === id));
    expect(mine.find((p) => p.id === id)!.status).toBe('pending');
    await denied(updateDoc(doc(user.db, 'mapProposals', id), { status: 'approved' }));

    // The admin sees it in the review queue and approves.
    const queue = await waitFor<MapProposal[]>((cb) => admin.subscribeProposals(cb), (ps) => ps.some((p) => p.id === id));
    const proposal = queue.find((p) => p.id === id)!;
    expect(proposal.building!.nodes.find((n) => n.id === 'f1-N-10')!.label).toBe('Dean Office');
    const version = await admin.approveProposal(proposal);
    expect(version).toBe(1);

    // Everyone now receives the approved building.
    const live = await waitFor<ApprovedBuilding[]>((cb) => other.subscribeBuildings(cb), (bs) => bs.some((b) => b.id === 'demo-hall'));
    const b = live.find((x) => x.id === 'demo-hall')!;
    expect(b.version).toBe(1);
    expect(b.building.nodes.find((n) => n.id === 'f1-N-10')!.label).toBe('Dean Office');
  });

  it('rejected proposals do not change the map', async () => {
    const { id } = await user.proposeMapUpdate({ ...createSampleBuilding(), name: 'Vandalised' }, 'bad edit', 1);
    const queue = await waitFor<MapProposal[]>((cb) => admin.subscribeProposals(cb), (ps) => ps.some((p) => p.id === id));
    expect(queue.length).toBeGreaterThan(0);
    await admin.rejectProposal(id);
    const live = await waitFor<ApprovedBuilding[]>((cb) => other.subscribeBuildings(cb), () => true);
    expect(live.find((x) => x.id === 'demo-hall')!.building.name).not.toBe('Vandalised');
  });
});
