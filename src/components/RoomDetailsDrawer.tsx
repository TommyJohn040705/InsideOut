import React from 'react';
import {
  X,
  Navigation,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Edit3,
  Flag,
  Accessibility,
  Building,
  Calendar,
  Layers,
} from 'lucide-react';
import { RoomPOI } from '../types/navigation';

interface RoomDetailsDrawerProps {
  room: RoomPOI | null;
  currentFloor: number;
  onClose: () => void;
  onSetAsDestination: (room: RoomPOI) => void;
  onSetAsStart: (room: RoomPOI) => void;
  onEditRoom: (room: RoomPOI) => void;
  onReportDiscrepancy: (room: RoomPOI) => void;
}

export const RoomDetailsDrawer: React.FC<RoomDetailsDrawerProps> = ({
  room,
  currentFloor,
  onClose,
  onSetAsDestination,
  onSetAsStart,
  onEditRoom,
  onReportDiscrepancy,
}) => {
  if (!room) return null;

  const isVerifiedPurpose = room.purposeVerification === 'verified_official_source';
  const isFlagged = room.navigabilityVerification === 'flagged_review' || !!room.notes;

  return (
    <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-40 bg-[#0c1324]/95 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-4 text-slate-100 animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold border border-sky-500/30">
              Level {room.floor || currentFloor}
            </span>
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">
              {room.roomNumber ? `E5-${room.roomNumber}` : room.id}
            </span>
          </div>
          <h3 className="text-base font-bold text-white tracking-tight leading-snug">
            {room.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
          title="Close details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Purpose / Description */}
      <div className="py-3 space-y-2.5">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
            Room Purpose & Usage
          </span>
          <p
            className={`text-xs leading-relaxed ${
              isVerifiedPurpose ? 'text-slate-200' : 'text-slate-400 italic'
            }`}
          >
            {room.purpose || 'Purpose not verified'}
          </p>
        </div>

        {/* Flagged Caution Note */}
        {room.notes && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-snug">{room.notes}</div>
          </div>
        )}

        {/* Verification Status Matrix */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {/* Location Verification */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-[10px]">
            <span className="text-slate-500 block">Physical Map</span>
            <div className="flex items-center gap-1 mt-0.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>Verified Drawing</span>
            </div>
          </div>

          {/* Purpose Verification */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-[10px]">
            <span className="text-slate-500 block">Room Purpose</span>
            {isVerifiedPurpose ? (
              <div className="flex items-center gap-1 mt-0.5 text-emerald-400 font-medium">
                <ShieldCheck className="w-3 h-3" />
                <span>Verified UW</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-0.5 text-slate-400 font-medium">
                <HelpCircle className="w-3 h-3" />
                <span>Unverified</span>
              </div>
            )}
          </div>

          {/* Navigability Verification */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-[10px]">
            <span className="text-slate-500 block">Navigability</span>
            {isFlagged ? (
              <div className="flex items-center gap-1 mt-0.5 text-amber-400 font-medium">
                <AlertTriangle className="w-3 h-3" />
                <span>Review Needed</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-0.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                <span>Walkable</span>
              </div>
            )}
          </div>
        </div>

        {/* Metadata Details */}
        <div className="space-y-1 pt-1 text-[11px] text-slate-400 font-mono">
          {room.drawingRevisionDate && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Drawing Revision:
              </span>
              <span className="text-slate-300">{room.drawingRevisionDate}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-1">
              <Accessibility className="w-3 h-3" /> Accessibility:
            </span>
            <span className={room.accessible !== false ? 'text-emerald-400' : 'text-rose-400'}>
              {room.accessible !== false ? 'Wheelchair Accessible' : 'Stairs Only'}
            </span>
          </div>

          {room.sourceUrl && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-500">Official Source:</span>
              <a
                href={room.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1 text-[10px] underline underline-offset-2"
              >
                <span>uwaterloo.ca</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-2 border-t border-slate-800 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSetAsStart(room)}
            className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Start Here</span>
          </button>
          <button
            onClick={() => onSetAsDestination(room)}
            className="w-full py-2 px-3 rounded-xl bg-[#ecc94b] hover:bg-[#d6b43b] text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-yellow-500/20"
          >
            <Navigation className="w-3.5 h-3.5 fill-current" />
            <span>Navigate Here</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
          <button
            onClick={() => onEditRoom(room)}
            className="flex items-center gap-1 hover:text-sky-300 transition-colors"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit Position/Purpose</span>
          </button>
          <button
            onClick={() => onReportDiscrepancy(room)}
            className="flex items-center gap-1 hover:text-rose-300 transition-colors"
          >
            <Flag className="w-3 h-3" />
            <span>Report Discrepancy</span>
          </button>
        </div>
      </div>
    </div>
  );
};
