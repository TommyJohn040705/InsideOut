import type { Building, MapEdge, Report, ReportKind } from './types';

/** How long a new report stays active without further confirmations. */
export const DEFAULT_REPORT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
/** Each confirmation extends the report's life by this much. */
export const CONFIRM_EXTENSION_MS = 2 * 60 * 60 * 1000; // 2 hours
/** A report never stays active longer than this from now (matches Firestore rules). */
export const MAX_REPORT_LIFETIME_MS = 6 * 60 * 60 * 1000; // 6 hours

let counter = 0;
const newId = () => `rpt-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function createReport(
  kind: ReportKind,
  targetId: string,
  note?: string,
  now: number = Date.now(),
  buildingId?: string,
): Report {
  return {
    id: newId(),
    buildingId,
    kind,
    targetId,
    note: note?.trim() || undefined,
    createdAt: now,
    confirmations: 1,
    clears: 0,
    expiresAt: now + DEFAULT_REPORT_TTL_MS,
  };
}

export function confirmReport(report: Report, now: number = Date.now()): Report {
  return {
    ...report,
    confirmations: report.confirmations + 1,
    expiresAt: Math.min(Math.max(report.expiresAt, now) + CONFIRM_EXTENSION_MS, now + MAX_REPORT_LIFETIME_MS),
  };
}

export function clearReport(report: Report): Report {
  return { ...report, clears: report.clears + 1 };
}

/**
 * A report affects routing while it has not expired and more people have
 * confirmed it than have marked it cleared.
 */
export function isReportActive(report: Report, now: number = Date.now()): boolean {
  return now < report.expiresAt && report.clears < report.confirmations;
}

export function activeReports(reports: Report[], now: number = Date.now()): Report[] {
  return reports.filter((r) => isReportActive(r, now));
}

/** Returns the set of edge ids that cannot be used because of active reports. */
export function blockedEdgeIds(
  building: Building,
  reports: Report[],
  now: number = Date.now(),
): Set<string> {
  const blocked = new Set<string>();
  const active = activeReports(reports, now);
  if (active.length === 0) return blocked;

  const nodeShaft = new Map<string, string | undefined>();
  for (const n of building.nodes) nodeShaft.set(n.id, n.shaftId);

  const outShafts = new Set(
    active.filter((r) => r.kind === 'elevator-out' || r.kind === 'stairs-closed').map((r) => r.targetId),
  );

  for (const r of active) {
    if (r.kind === 'blocked-corridor') blocked.add(r.targetId);
  }

  if (outShafts.size > 0) {
    for (const e of building.edges) {
      if (e.kind === 'walkway') continue;
      const s = nodeShaft.get(e.from) ?? nodeShaft.get(e.to);
      if (s && outShafts.has(s)) blocked.add(e.id);
    }
  }
  return blocked;
}

export function describeReportTarget(building: Building, report: Report): string {
  if (report.kind === 'elevator-out' || report.kind === 'stairs-closed') {
    const node = building.nodes.find((n) => n.shaftId === report.targetId);
    return (node?.label ?? report.targetId).replace(/\s*\(.*\)$/, '');
  }
  const edge: MapEdge | undefined = building.edges.find((e) => e.id === report.targetId);
  if (!edge) return report.targetId;
  const a = building.nodes.find((n) => n.id === edge.from);
  const b = building.nodes.find((n) => n.id === edge.to);
  const name = (n?: { label?: string; id: string }) => n?.label ?? n?.id ?? '?';
  return `${name(a)} to ${name(b)}`;
}

const STORAGE_KEY = 'insideout.reports.v1';

export function loadReports(): Report[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Report[]) : [];
  } catch {
    return [];
  }
}

export function saveReports(reports: Report[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    // Storage unavailable (private mode etc.); reports stay in memory only.
  }
}
