import React, { useState } from 'react';
import { buildingCode } from './Panels';
import { AlertTriangle, X, Check, Phone, Building2 } from 'lucide-react';
import { REPORT_TYPES, RoomReport } from '../utils/reports';
import { RoomPOI } from '../types/navigation';

interface WorkplaceIssueModalProps {
  open: boolean;
  onClose: () => void;
  rooms: RoomPOI[];
  initialRoomId?: string | null;
  initialCategory?: string;
  onSubmitReport: (report: RoomReport) => void;
}

export function WorkplaceIssueModal({
  open,
  onClose,
  rooms,
  initialRoomId,
  initialCategory,
  onSubmitReport,
}: WorkplaceIssueModalProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(initialRoomId || '');
  const [reportType, setReportType] = useState<string>(initialCategory || 'classroom_av');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Sync initial props
  React.useEffect(() => {
    if (initialRoomId) setSelectedRoomId(initialRoomId);
    if (initialCategory) setReportType(initialCategory);
  }, [initialRoomId, initialCategory, open]);

  if (!open) return null;

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const currentTypeConfig = REPORT_TYPES.find((t) => t.value === reportType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportType) return;

    const report: RoomReport = {
      id: `rep-${Date.now()}`,
      roomId: selectedRoomId || null,
      roomLabel: selectedRoom ? (selectedRoom.roomNumber ? `${buildingCode(selectedRoom)} ${selectedRoom.roomNumber}` : selectedRoom.name) : 'General E5 Facility',
      floor: selectedRoom?.floor ?? null,
      type: reportType,
      details: details.trim(),
      createdAt: new Date().toISOString(),
      confirmations: 1,
    };

    onSubmitReport(report);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setDetails('');
      onClose();
    }, 1400);
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Report a workplace or classroom problem"
    >
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ring-1 ring-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center text-white">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold">Report a Workplace or Facility Issue</h3>
              <p className="text-xs text-slate-400">Notifies staff and tags this room on the map</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">Issue Reported</h4>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              This notice is now visible on the room details and floor view. If urgent, contact {currentTypeConfig?.department || 'Plant Operations'} at {currentTypeConfig?.hotline || 'ext. 33793'}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Room Picker */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Room or Location in E5
              </label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Building General / Common Hallway</option>
                {rooms
                  .filter((r) => r.roomNumber || r.category === 'classroom' || r.category === 'restroom' || r.category === 'elevator')
                  .slice(0, 150)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomNumber ? `${buildingCode(r)} ${r.roomNumber}` : r.name} (Floor {r.floor} · {r.name})
                    </option>
                  ))}
              </select>
            </div>

            {/* Problem Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Issue Category
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} {t.department ? `(${t.department})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Department Hotline Info Box */}
            {currentTypeConfig?.department && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200/80 text-xs text-blue-950 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold">Waterloo Support Unit: </span>
                    <span>{currentTypeConfig.department}</span>
                  </div>
                </div>
                {currentTypeConfig.hotline && (
                  <span className="font-mono font-bold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded text-[11px] shrink-0">
                    {currentTypeConfig.hotline}
                  </span>
                )}
              </div>
            )}

            {/* Details */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Additional Details (Optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g. HDMI port 1 is loose, projector image is flickering, or door badge reader beeping red..."
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors"
              >
                Submit Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
