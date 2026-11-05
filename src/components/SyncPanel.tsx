import { useEffect, useState } from 'react';
import type { SyncBackend } from '../lib/sync/backend';
import type { MapProposal, SyncUser } from '../lib/sync/model';
import type { SyncStatus } from '../lib/sync/useSync';
import type { Building } from '../lib/types';

/**
 * Shared-map controls shown in Edit mode: submit local edits for approval,
 * see your proposals, and (for admins) approve or reject the queue.
 */
interface Props {
  status: SyncStatus;
  error?: string;
  backend: SyncBackend | null;
  user: SyncUser | null;
  building: Building;
  dirty: boolean;
  syncedVersion: number;
  onDiscardLocal: () => void;
  onToast: (msg: string) => void;
}

function summary(b: Building | null): string {
  if (!b) return 'invalid building data';
  const places = b.nodes.filter((n) => n.kind !== 'corridor').length;
  return `${b.floors.length} floor${b.floors.length === 1 ? '' : 's'}, ${places} places, ${b.edges.length} connections`;
}

export function SyncPanel({ status, error, backend, user, building, dirty, syncedVersion, onDiscardLocal, onToast }: Props) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposals, setProposals] = useState<MapProposal[]>([]);

  useEffect(() => {
    if (!backend || !user) return;
    return backend.subscribeProposals(setProposals, (e) => onToast(`Could not load proposals: ${e.message}`));
  }, [backend, user, onToast]);

  if (status === 'off') {
    return (
      <div className="props">
        <h3>Shared map</h3>
        <p className="muted">
          Edits and reports are saved on this device only. When the app is deployed to Firebase, changes can be submitted for
          approval and reports sync to everyone.
        </p>
      </div>
    );
  }
  if (status === 'connecting') return <div className="props"><h3>Shared map</h3><p className="muted">Connecting...</p></div>;
  if (status === 'error' || !backend) {
    return (
      <div className="props">
        <h3>Shared map</h3>
        <p className="error">Could not connect to Firebase: {error ?? 'unknown error'}</p>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const mine = proposals.filter((p) => p.authorUid === user?.uid && p.buildingId === building.id).slice(0, 5);
  const queue = user?.isAdmin ? proposals.filter((p) => p.status === 'pending') : [];

  return (
    <div className="props">
      <h3>Shared map</h3>
      <p className="muted">
        Live with Firebase ({backend.projectId}). Approved version: {syncedVersion || 'none yet'}.
        {dirty ? ' You have local changes that others cannot see yet.' : ''}
      </p>
      <label>
        Note for the reviewer
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added E7 floor 3 room numbers" />
      </label>
      <div className="row">
        <button
          className="primary"
          disabled={busy || !dirty}
          onClick={() =>
            run(async () => {
              const { droppedImages } = await backend.proposeMapUpdate(building, note, syncedVersion);
              setNote('');
              onToast(
                `Submitted for approval.${droppedImages.length ? ` Floor photos for ${droppedImages.join(', ')} were too large to include.` : ''}`,
              );
            })
          }
        >
          Submit for approval
        </button>
        {dirty && syncedVersion > 0 && (
          <button className="danger" disabled={busy} onClick={onDiscardLocal}>
            Discard local changes
          </button>
        )}
      </div>

      {mine.length > 0 && (
        <>
          <h4>Your submissions</h4>
          <ul className="plain">
            {mine.map((p) => (
              <li key={p.id}>
                <span className={`chip status-${p.status}`}>{p.status}</span> {new Date(p.createdAt).toLocaleString()}
                {p.note ? ` - ${p.note}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {user?.isAdmin && (
        <>
          <h4>Review queue ({queue.length})</h4>
          {queue.length === 0 && <p className="muted">Nothing waiting for review.</p>}
          <ul className="plain">
            {queue.map((p) => (
              <li key={p.id} className="review">
                <b>{p.buildingName}</b>: {summary(p.building)}
                {p.note && <div className="note">"{p.note}"</div>}
                <small className="muted">
                  {new Date(p.createdAt).toLocaleString()} - based on version {p.baseVersion}
                </small>
                <div className="row">
                  <button className="primary small" disabled={busy || !p.building} onClick={() => run(async () => {
                    const v = await backend.approveProposal(p);
                    onToast(`Approved. ${p.buildingName} is now version ${v} for everyone.`);
                  })}>
                    Approve
                  </button>
                  <button className="small" disabled={busy} onClick={() => run(() => backend.rejectProposal(p.id))}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="row">
        {user && !user.isAnonymous ? (
          <>
            <small className="muted">Signed in as {user.email ?? user.uid}{user.isAdmin ? ' (admin)' : ''}</small>
            <button className="small" onClick={() => run(() => backend.signOut())}>Sign out</button>
          </>
        ) : (
          <button className="small" onClick={() => run(() => backend.signInWithGoogle())}>
            Sign in with Google (reviewers)
          </button>
        )}
      </div>
      {user && <small className="muted">Your user ID: <code>{user.uid}</code></small>}
    </div>
  );
}
