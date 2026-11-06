import React from 'react';
import {
  Camera,
  Upload,
  Building2,
  HelpCircle,
  Compass,
  Edit3,
  Flag,
  Layers,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { FloorPlanData } from '../types/navigation';

interface TopBarProps {
  currentPlan: FloorPlanData;
  allPlans: FloorPlanData[];
  isEditingMode: boolean;
  onSelectPlan: (plan: FloorPlanData) => void;
  onSelectFloorNumber: (floorNumber: number) => void;
  onToggleEditMode: () => void;
  onOpenReportModal: () => void;
  onOpenCamera: () => void;
  onOpenUpload: () => void;
  onOpenHelp: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentPlan,
  allPlans,
  isEditingMode,
  onSelectPlan,
  onSelectFloorNumber,
  onToggleEditMode,
  onOpenReportModal,
  onOpenCamera,
  onOpenUpload,
  onOpenHelp,
}) => {
  const isE5Building = currentPlan.buildingId === 'uwaterloo-e5' || currentPlan.id.startsWith('e5-');

  // Distinct buildings
  const buildings = [
    { id: 'uwaterloo-e5', name: 'University of Waterloo — Engineering 5 (E5)', defaultFloor: 1 },
    { id: 'helix-hub', name: 'Helix Innovation Hub', defaultFloor: 2 },
    { id: 'mercy-hospital', name: 'Mercy Medical Pavilion', defaultFloor: 1 },
    { id: 'skyline-airport', name: 'Skyline Terminal B', defaultFloor: 1 },
  ];

  const handleSelectBuilding = (bId: string) => {
    const target = allPlans.find((p) => p.buildingId === bId || (bId === 'uwaterloo-e5' && p.id.startsWith('e5-')));
    if (target) {
      onSelectPlan(target);
    }
  };

  const currentBuildingId = isE5Building ? 'uwaterloo-e5' : currentPlan.buildingId || 'helix-hub';

  return (
    <header className="h-16 px-3 sm:px-5 bg-[#0a0f1d]/95 backdrop-blur-xl border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0 z-30 select-none">
      {/* App Branding & Building Dropdown */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-yellow-400 via-amber-400 to-amber-500 flex items-center justify-center text-slate-950 shadow-md shadow-yellow-500/20 ring-1 ring-yellow-400/40">
          <Compass className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black tracking-tight text-white whitespace-nowrap">
              FloorNav AI
            </span>
            <span className="hidden md:inline-block text-[10px] uppercase font-mono tracking-widest text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full font-bold">
              UWaterloo E5
            </span>
          </div>

          {/* Building Selector Dropdown */}
          <select
            value={currentBuildingId}
            onChange={(e) => handleSelectBuilding(e.target.value)}
            className="text-[11px] font-mono text-slate-400 bg-transparent border-0 p-0 focus:outline-none cursor-pointer hover:text-white"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Floor Selector Buttons (1 through 6 for E5) - Desktop (Mobile uses floating overlay pills) */}
      {isE5Building && (
        <div className="hidden lg:flex items-center gap-1.5 p-1 bg-slate-950/90 rounded-2xl border border-slate-800/80 shadow-inner">
          <span className="hidden lg:inline text-[10px] font-mono font-bold text-slate-400 px-2 uppercase">
            FLOOR:
          </span>
          {[1, 2, 3, 4, 5, 6].map((fNum) => {
            const isActive = currentPlan.floorNumber === fNum;
            const floorLabels: Record<number, string> = {
              1: 'L1: SDC & Machine Shop',
              2: 'L2: Main Entrance & Gear Lab',
              3: 'L3: Classrooms & E3 Bridge',
              4: 'L4: ECE & Roof Garden',
              5: 'L5: Dean of Engineering',
              6: 'L6: Systems Design & BME',
            };

            return (
              <button
                key={fNum}
                onClick={() => onSelectFloorNumber(fNum)}
                title={floorLabels[fNum]}
                className={`w-8 h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${
                  isActive
                    ? 'bg-[#ecc94b] text-slate-950 shadow-md shadow-yellow-500/25 scale-105'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {fNum}
              </button>
            );
          })}
        </div>
      )}

      {/* Action Buttons: Edit, Report, Upload, Scan, Help */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={onToggleEditMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
            isEditingMode
              ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 ring-2 ring-amber-400/30'
              : 'text-slate-400 hover:text-white bg-slate-900 border-slate-800 hover:bg-slate-800'
          }`}
          title="Floor Plan Annotation & Correction Mode"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isEditingMode ? 'Editing Map' : 'Edit Mode'}</span>
        </button>

        <button
          onClick={onOpenReportModal}
          className="p-2 text-slate-400 hover:text-rose-300 hover:bg-slate-800/80 rounded-xl transition-colors border border-transparent hover:border-slate-800"
          title="Report Map Discrepancy or Closed Corridor"
        >
          <Flag className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenUpload}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors"
          title="Upload authorized floor plan image"
        >
          <Upload className="w-3.5 h-3.5 text-sky-400" />
          <span>Upload</span>
        </button>

        <button
          onClick={onOpenCamera}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 rounded-xl shadow-sm transition-all"
          title="Capture floor plan photo with Camera"
        >
          <Camera className="w-3.5 h-3.5 text-slate-950" />
          <span>Scan</span>
        </button>

        <button
          onClick={onOpenHelp}
          className="p-2 text-slate-400 hover:text-sky-300 hover:bg-slate-800/80 rounded-xl transition-colors border border-transparent hover:border-slate-800"
          title="E5 Inventory Stats & Documentation Sources"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
