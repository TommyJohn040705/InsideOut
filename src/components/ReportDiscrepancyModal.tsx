import React, { useState } from 'react';
import { X, Flag, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { RoomPOI } from '../types/navigation';

interface ReportDiscrepancyModalProps {
  isOpen: boolean;
  room: RoomPOI | null;
  onClose: () => void;
}

export const ReportDiscrepancyModal: React.FC<ReportDiscrepancyModalProps> = ({
  isOpen,
  room,
  onClose,
}) => {
  const [issueType, setIssueType] = useState('incorrect_label');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setDescription('');
      onClose();
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0d1527] border border-slate-700/80 rounded-3xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-rose-400">
            <Flag className="w-4 h-4" />
            <h3 className="text-sm font-bold text-white">Report Map Discrepancy</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white">Report Submitted</h4>
            <p className="text-xs text-slate-400 max-w-xs">
              Thank you for contributing! Your report has been flagged for architectural review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="pt-4 space-y-3.5">
            {room && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <span className="text-slate-500 block text-[10px] font-mono">SELECTED ROOM:</span>
                <span className="font-bold">{room.name}</span> ({room.roomNumber || room.id}) · Floor {room.floor}
              </div>
            )}

            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">Issue Category</label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-rose-500"
              >
                <option value="incorrect_label">Incorrect room number or title</option>
                <option value="closed_corridor">Corridor / door closed for construction</option>
                <option value="elevator_out">Elevator or wheelchair ramp maintenance</option>
                <option value="unverified_purpose">Room purpose has changed / outdated</option>
                <option value="misplaced_pin">Location marker inaccurate</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">Details & Evidence</label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what is physically present on site..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-rose-500 leading-relaxed"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-400 text-white transition-colors shadow-md shadow-rose-500/20"
              >
                Submit Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
