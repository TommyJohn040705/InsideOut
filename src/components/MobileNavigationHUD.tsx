import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, ArrowLeft } from 'lucide-react';
import { NavigationRoute } from '../types/navigation';
import { speechService } from '../utils/speech';
import { MobileStatusBar } from './MobileStatusBar';

interface MobileNavigationHUDProps {
  route: NavigationRoute;
  currentStepIndex: number;
  simulatedProgress: number; // 0 to 1
  onEndNavigation: () => void;
  onNextStep: () => void;
}

export const MobileNavigationHUD: React.FC<MobileNavigationHUDProps> = ({
  route,
  currentStepIndex,
  simulatedProgress,
  onEndNavigation,
  onNextStep,
}) => {
  const [isVoiceActive, setIsVoiceActive] = useState(!speechService.getMuted());
  const currentStep = route.steps[currentStepIndex] || route.steps[0];
  const nextStep = route.steps[currentStepIndex + 1];

  // Voice speech announcement on step changes
  useEffect(() => {
    if (isVoiceActive && currentStep) {
      speechService.speak(currentStep.instruction);
    }
  }, [currentStepIndex, isVoiceActive, currentStep]);

  const toggleVoice = () => {
    const nextState = !isVoiceActive;
    setIsVoiceActive(nextState);
    speechService.setMuted(!nextState);
  };

  // Remaining distance calculated based on simulatedProgress
  const remainingMeters = Math.max(
    0,
    Math.round(route.totalDistanceMeters * (1 - simulatedProgress))
  );

  return (
    <>
      {/* Top Floating Turn Card (Screen 4) */}
      <div className="absolute top-0 left-0 right-0 z-30 pt-1 pointer-events-none">
        <MobileStatusBar dark={false} />

        <div className="px-4 pt-1 pointer-events-auto flex flex-col items-center">
          {/* Main Two-Tone Banner */}
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl flex border border-black/10">
            {/* Left Amber Block with sharp turn arrow */}
            <div className="bg-[#ecc94b] w-20 flex items-center justify-center p-3 shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-8 h-8 text-slate-950 fill-none stroke-current stroke-[3.5] stroke-linecap-round stroke-linejoin-round"
              >
                <path d="M 8 7 L 3 12 L 8 17" />
                <path d="M 3 12 L 14 12 C 17.5 12 19 14 19 18 L 19 21" />
              </svg>
            </div>

            {/* Right Black Block */}
            <div className="bg-[#111827] flex-1 p-3.5 text-white">
              <div className="text-2xl font-extrabold leading-tight tracking-tight">
                {currentStep.distanceMeters > 0 ? `${currentStep.distanceMeters} m` : '12 m'}
              </div>
              <div className="text-xs text-slate-200 font-semibold leading-snug mt-0.5">
                {currentStep.instruction.replace(/for approx \d+ meters\./, '').trim() ||
                  'Turn left past the Boardroom'}
              </div>
            </div>
          </div>

          {/* Sub-banner Directly Below */}
          {nextStep ? (
            <div className="bg-[#111827] text-slate-300 text-[11px] font-medium px-4 py-1.5 rounded-b-xl -mt-0.5 shadow-md flex items-center gap-1.5 border-t border-slate-800">
              <span>Then: {nextStep.instruction.replace(/for approx \d+ meters\./, '').trim()}</span>
            </div>
          ) : (
            <div className="bg-[#111827] text-slate-300 text-[11px] font-medium px-4 py-1.5 rounded-b-xl -mt-0.5 shadow-md flex items-center gap-1.5 border-t border-slate-800">
              <span>Then: Arrive at {route.toName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation Bar (Screen 4) */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-[0_-10px_35px_rgba(0,0,0,0.12)] p-5 border-t border-slate-100 flex items-center justify-between animate-in slide-in-from-bottom-6 duration-200">
        <div>
          <div className="text-2xl font-extrabold text-slate-900 leading-none">
            {Math.max(1, Math.ceil(route.estimatedWalkTimeMinutes * (1 - simulatedProgress)))} min
          </div>
          <div className="text-xs text-slate-500 font-semibold font-mono mt-1">
            {remainingMeters} m left
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice Toggle */}
          <button
            onClick={toggleVoice}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              isVoiceActive
                ? 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                : 'bg-slate-50 text-slate-400'
            }`}
          >
            {isVoiceActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>Voice</span>
          </button>

          {/* Red End Button */}
          <button
            onClick={onEndNavigation}
            className="px-6 py-2.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold rounded-xl shadow-sm transition-colors active:scale-95"
          >
            End
          </button>
        </div>
      </div>
    </>
  );
};
