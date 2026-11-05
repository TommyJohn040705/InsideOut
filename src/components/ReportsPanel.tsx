import { describeReportTarget, isReportActive } from '../lib/reports';
import type { Building, Report } from '../lib/types';

interface Props {
  building: Building;
  reports: Report[];
  now: number;
  onConfirm: (id: string) => void;
  onClear: (id: string) => void;
}

const KIND_LABEL: Record<Report['kind'], string> = {
  'blocked-corridor': 'Blocked corridor',
  'elevator-out': 'Elevator out of service',
  'stairs-closed': 'Stairwell closed',
};

function ago(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export function ReportsPanel({ building, reports, now, onConfirm, onClear }: Props) {
  const active = reports.filter((r) => isReportActive(r, now)).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <section className="panel">
      <h2>Live reports</h2>
      <p className="hint">
        In <b>Report</b> mode, tap a corridor on the map to mark it blocked, or tap an elevator or stairwell to mark it out
        of service. Routes update automatically. Reports expire after 4 hours unless others confirm them.
      </p>
      {active.length === 0 ? (
        <p className="muted">No active reports.</p>
      ) : (
        <ul className="reports">
          {active.map((r) => (
            <li key={r.id}>
              <div>
                <b>{KIND_LABEL[r.kind]}</b>: {describeReportTarget(building, r)}
                {r.note && <div className="note">"{r.note}"</div>}
                <small>
                  {ago(now - r.createdAt)} - {r.confirmations} confirmed, {r.clears} cleared
                </small>
              </div>
              <div className="actions">
                <button onClick={() => onConfirm(r.id)}>Still there</button>
                <button onClick={() => onClear(r.id)}>Cleared</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
