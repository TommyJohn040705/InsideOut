import React from 'react';
import {
  X,
  Building,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Layers,
  HelpCircle,
  CheckCircle2,
  Calendar,
  Accessibility,
} from 'lucide-react';
import { getE5Stats, E5_SOURCES } from '../data/e5/e5DataLoader';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const stats = getE5Stats();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-2xl max-h-[85vh] bg-[#0c1324] border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Engineering 5 (E5) Building Map Inventory
              </h3>
              <p className="text-xs text-slate-400">
                Official University of Waterloo Architectural Data Set (Building No. 53)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
              <span className="text-2xl font-black text-white">{stats.totalRooms}</span>
              <span className="text-[11px] font-mono text-slate-400 block mt-0.5">Total Extracted Rooms</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-center">
              <span className="text-2xl font-black text-emerald-400">{stats.verifiedPurpose}</span>
              <span className="text-[11px] font-mono text-emerald-300/80 block mt-0.5">Verified UW Purposes</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
              <span className="text-2xl font-black text-slate-400">{stats.unknownPurpose}</span>
              <span className="text-[11px] font-mono text-slate-400 block mt-0.5">Purpose Not Verified</span>
            </div>
            <div className="p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-center">
              <span className="text-2xl font-black text-purple-300">6 Floors</span>
              <span className="text-[11px] font-mono text-purple-300/80 block mt-0.5">Complete Levels 1–6</span>
            </div>
          </div>

          {/* Floor-by-Floor Breakdown Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>Floor Extraction & Verification Audit</span>
            </h4>
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/60">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Floor</th>
                    <th className="py-2.5 px-3">Extracted Rooms</th>
                    <th className="py-2.5 px-3">Verified Purpose</th>
                    <th className="py-2.5 px-3">Purpose Not Verified</th>
                    <th className="py-2.5 px-3">Drawing Revision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                  {stats.floorStats.map((f) => (
                    <tr key={f.floor} className="hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-bold text-white">Level {f.floor}</td>
                      <td className="py-2 px-3">{f.total} rooms</td>
                      <td className="py-2 px-3 text-emerald-400 font-medium">{f.verified} verified</td>
                      <td className="py-2 px-3 text-slate-400">{f.unknown} unknown</td>
                      <td className="py-2 px-3 text-slate-400">{f.revision}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Navigation Connections Review Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Navigation Connections & Review Status</span>
            </h4>
            <div className="space-y-2">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Engineering 3 (E3) Pedestrian Overpass (Room 3818 / 3815) — FLAG FOR VERIFICATION</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  University of Waterloo accessibility documentation contains conflicting descriptions: the E3 building profile documents an overpass connecting to E5 from Level 3, while another entry notes an overpass accessible from the 5th floor. The physical Plant Operations drawings (053E5_03FLR & 053E5_04FLR) confirm the pedestrian link bridge 3818 extends from the southeast corner of Level 3 over Ring Road. Flagged for on-site ramp clearance verification.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Southeast Passenger Elevator Bank (1801/1802 - 6801/6802) — VERIFIED ACCESSIBLE</span>
                </div>
                <p className="leading-relaxed text-[11px] text-slate-400">
                  Primary vertical transit core servicing all levels (1 to 6). Wheelchair accessible route generator prioritizes this elevator bank and bypasses stairs.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Engineering 7 (E7) North Overpasses — VERIFIED CONNECTED</span>
                </div>
                <p className="leading-relaxed text-[11px] text-slate-400">
                  Direct indoor corridors connect E5 to E7 on Levels 1, 2, 3, 5, and 6 along the north wall.
                </p>
              </div>
            </div>
          </div>

          {/* Official Waterloo Documentation Sources */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official University of Waterloo Sources</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {E5_SOURCES.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-colors flex items-start justify-between group"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-200 group-hover:text-sky-300 block">
                      {s.name}
                    </span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">{s.description}</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 shrink-0 ml-1.5 mt-0.5" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Confidential campus drawings preserved in internal studio.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
