import { describe, expect, it } from 'vitest';
import { withEvidence } from '../src/campus/evidenceIndex';

type R = { roomNumber?: string; name: string; purpose?: string; purposeVerification?: string; sourceUrl?: string };

describe('published listings on imported rooms', () => {
  it('names a drawing-only room from its official listing, with the source', () => {
    const r = withEvidence<R>({ roomNumber: '6516', name: 'Room 6516', purposeVerification: 'unverified_drawing_only' }, 'MC');
    expect(r.name).toMatch(/Layton/);
    expect(r.purposeVerification).toBe('verified_official_source');
    expect(r.sourceUrl).toMatch(/^https:\/\/uwaterloo\.ca\//);
  });

  it('keeps the access warning in the purpose', () => {
    const lab = withEvidence<R>({ roomNumber: 'B709', name: 'Room B709' }, 'QNC');
    expect(lab.purpose).toMatch(/Restricted lab/);
  });

  it('leaves rooms a person described, and rooms with no listing, unchanged', () => {
    const staff = { roomNumber: '6516', name: 'Seminar room', purposeVerification: 'staff_reported' };
    expect(withEvidence(staff, 'MC')).toBe(staff);
    const plain = { roomNumber: '9999', name: 'Room 9999' };
    expect(withEvidence(plain, 'MC')).toBe(plain);
  });
});
