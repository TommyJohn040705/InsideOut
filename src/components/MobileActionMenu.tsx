import React from 'react';
import { Camera, Upload, Building2, Sparkles, X } from 'lucide-react';
import { FloorPlanData } from '../types/navigation';

interface MobileActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  allPlans: FloorPlanData[];
  currentPlan: FloorPlanData;
  onSelectPlan: (plan: FloorPlanData) => void;
  onOpenCamera: () => void;
  onOpenUpload: () => void;
  onOpenAIWayfinder: () => void;
}

export const MobileActionMenu: React.FC<MobileActionMenuProps> = ({
  isOpen,
  onClose,
  allPlans,
  currentPlan,
  onSelectPlan,
  onOpenCamera,
  onOpenUpload,
  onOpenAIWayfinder,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md mx-auto bg-white rounded-t-3xl p-5 shadow-2xl border-t border-slate-100 space-y-4 animate-in slide-in-from-bottom-8 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />

        <div className="flex items-center justify-between pb-1">
          <h3 className="text-base font-bold text-slate-900">Floor & Plan Options</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary AI Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => {
              onClose();
              onOpenCamera();
            }}
            className="p-3.5 bg-[#f0f3f0] hover:bg-[#e4eae4] rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors text-center"
          >
            <div className="w-10 h-10 rounded-full bg-[#ecc94b] flex items-center justify-center text-slate-950 font-bold shadow-sm">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">Scan with Camera</span>
              <span className="text-[10px] text-slate-500">Take photo of plan</span>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenUpload();
            }}
            className="p-3.5 bg-[#f0f3f0] hover:bg-[#e4eae4] rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors text-center"
          >
            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold shadow-sm">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">Upload Photo</span>
              <span className="text-[10px] text-slate-500">From camera roll</span>
            </div>
          </button>
        </div>

        {/* AI Wayfinder Action */}
        <button
          onClick={() => {
            onClose();
            onOpenAIWayfinder();
          }}
          className="w-full p-3.5 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 rounded-2xl flex items-center gap-3 text-left transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-bold text-slate-900">Ask AI Indoor Wayfinder</h4>
            <p className="text-[11px] text-slate-500">Where is the nearest restroom, exit, or coffee?</p>
          </div>
        </button>

        {/* Floor / Building Switcher */}
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-2">
            SWITCH FLOOR OR VENUE:
          </span>
          <div className="space-y-1">
            {allPlans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => {
                  onSelectPlan(plan);
                  onClose();
                }}
                className={`w-full p-2.5 rounded-xl text-left text-xs flex items-center justify-between transition-colors ${
                  plan.id === currentPlan.id
                    ? 'bg-[#ecc94b]/20 border border-[#ecc94b] font-bold text-slate-950'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>{plan.title}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {plan.id.includes('office') ? 'F2' : plan.id.includes('hospital') ? 'F1' : 'B'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
