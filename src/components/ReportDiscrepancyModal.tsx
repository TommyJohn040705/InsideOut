import React, { useEffect, useState } from 'react';
import { X, Flag, CheckCircle2 } from 'lucide-react';
import { RoomPOI } from '../types/navigation';
import { cx } from './Panels';

/** Problem reports, saved on this device. Shown on the room until someone marks them fixed. */

export interface RoomReport {
  id: string;
  roomId: string | null;
  roomLabel: string;
  floor: number | null;
  type: string;
  details: string;
  createdAt: string;
  confirmations: number;
}

export const REPORT_TYPES: { value: string; label: string }[] = [
  { value: 'elevator_out', label: 'Elevator not working' },
  { value: 'door_locked', label: 'Door locked or blocked' },
  { value: 'hallway_blocked', label: 'Hallway closed or blocked' },
  { value: 'maintenance', label: 'Needs maintenance or cleaning' },
  { value: 'wrong_info', label: 'Room name or purpose is wrong' },
  { value: 'wrong_spot', label: 'Room is in the wrong spot on the map' },
  { value: 'other', label: 'Something else' },
];
export const reportLabel = (t: string) => REPORT_TYPES.find((x) => x.value === t)?.label || 'Problem';

const KEY = 'floornav.reports.v1';
export function loadReports(): RoomReport[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; }
}
export function saveReports(list: RoomReport[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

interface Props {
  isOpen: boolean;
  room: RoomPOI | null;
  onClose: () => void;
  onSubmit?: (r: RoomReport) => void;
}

export const ReportDiscrepancyModal: React.FC<Props> = ({ isOpen, room, onClose, onSubmit }) => {
  const [type, setType] = useState(room?.category === 'elevator' ? 'elevator_out' : 'door_locked');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (isOpen) { setSubmitted(false); setDetails(''); setType(room?.category === 'elevator' ? 'elevator_out' : 'door_locked'); } }, [isOpen, room?.id]);
  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r: RoomReport = {
      id: `rep-${Date.now()}`,
      roomId: room?.id || null,
      roomLabel: room ? (room.roomNumber ? `E5 ${room.roomNumber}` : room.name) : 'General',
      floor: room?.floor ?? null,
      type, details: details.trim(), createdAt: new Date().toISOString(), confirmations: 1,
    };
    onSubmit?.(r);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><Flag className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-slate-900">Report a problem</p>
            <p className="text-xs text-slate-500 truncate">{room ? `${room.roomNumber ? `E5 ${room.roomNumber} · ` : ''}${room.name} · Floor ${room.floor}` : 'Anywhere in the building'}</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        {submitted ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-50 text-green-600 flex items-center justify-center"><CheckCircle2 className="w-7 h-7" /></div>
            <p className="text-lg font-extrabold text-slate-900">Report saved</p>
            <p className="text-sm text-slate-500">It shows on the room until someone marks it fixed.</p>
            <button onClick={onClose} className="h-11 px-6 rounded-full bg-blue-600 text-white font-bold">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2">
              {REPORT_TYPES.map((t) => (
                <label key={t.value} className={cx('flex items-center gap-3 h-11 px-3 rounded-xl ring-1 cursor-pointer text-[15px]',
                  type === t.value ? 'ring-2 ring-blue-600 bg-blue-50 text-blue-900 font-semibold' : 'ring-slate-200 text-slate-800')}>
                  <input type="radio" name="rtype" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="w-4 h-4" />
                  {t.label}
                </label>
              ))}
            </div>
            <textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional), e.g. north door by the stairs"
              className="w-full rounded-xl ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 outline-none p-3 text-[16px] resize-none" />
            <button type="submit" className="w-full h-12 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold">Submit report</button>
          </form>
        )}
      </div>
    </div>
  );
};
