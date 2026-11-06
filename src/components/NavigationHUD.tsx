import React, { useEffect, useState } from 'react';
import {
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  CheckCircle,
  Volume2,
  VolumeX,
  X,
  ChevronRight,
  ChevronLeft,
  Footprints,
  Clock,
  Sparkles,
  MapPin,
  Play,
  Pause,
} from 'lucide-react';
import { NavigationRoute, ManeuverAction } from '../types/navigation';
import { speechService } from '../utils/speech';

interface NavigationHUDProps {
  route: NavigationRoute;
  currentStepIndex: number;
  isSimulatingWalk: boolean;
  onNextStep: () => void;
  onPrevStep: () => void;
  onExitNavigation: () => void;
  onToggleSimulateWalk: () => void;
}

export const NavigationHUD: React.FC<NavigationHUDProps> = ({
  route,
  currentStepIndex,
  isSimulatingWalk,
  onNextStep,
  onPrevStep,
  onExitNavigation,
  onToggleSimulateWalk,
}) => {
  const [isVoiceMuted, setIsVoiceMuted] = useState(speechService.getMuted());
  const currentStep = route.steps[currentStepIndex] || route.steps[0];
  const nextStep = route.steps[currentStepIndex + 1];
  const isLastStep = currentStepIndex === route.steps.length - 1;

  useEffect(() => {
    if (!isVoiceMuted && currentStep) {
      speechService.speak(currentStep.instruction);
    }
  }, [currentStepIndex, isVoiceMuted, currentStep]);

  const toggleMute = () => {
    const nextState = !isVoiceMuted;
    setIsVoiceMuted(nextState);
    speechService.setMuted(nextState);
  };

  const getManeuverIcon = (action: ManeuverAction) => {
    switch (action) {
      case 'turn-left':
        return <ArrowLeft className="w-8 h-8 text-sky-400 stroke-[2.5]" />;
      case 'turn-right':
        return <ArrowRight className="w-8 h-8 text-sky-400 stroke-[2.5]" />;
      case 'slight-left':
        return <ArrowUpLeft className="w-8 h-8 text-sky-400 stroke-[2.5]" />;
      case 'slight-right':
        return <ArrowUpRight className="w-8 h-8 text-sky-400 stroke-[2.5]" />;
      case 'arrive':
        return <CheckCircle className="w-8 h-8 text-emerald-400 stroke-[2.5]" />;
      default:
        return <ArrowUp className="w-8 h-8 text-sky-400 stroke-[2.5]" />;
    }
  };

  return (
    <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-[430px] z-30 animate-in slide-in-from-top-4 duration-300">
      <div className="bg-[#090f1f]/95 backdrop-blur-2xl rounded-3xl border border-sky-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-4 text-white">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-semibold text-slate-300 truncate">
              To <strong className="text-white">{route.toName}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Auto-walk simulation toggle */}
            <button
              onClick={onToggleSimulateWalk}
              className={`p-2 rounded-xl text-xs font-bold transition-all ${
                isSimulatingWalk
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
              title={isSimulatingWalk ? 'Pause Walking Simulation' : 'Auto Play Simulation'}
            >
              {isSimulatingWalk ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            {/* Voice toggle */}
            <button
              onClick={toggleMute}
              className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition-colors"
              title={isVoiceMuted ? 'Unmute Voice Announcements' : 'Mute Voice Announcements'}
            >
              {isVoiceMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-sky-400" />
              )}
            </button>

            {/* Exit HUD */}
            <button
              onClick={onExitNavigation}
              className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors"
              title="Close Navigation HUD"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Maneuver Display */}
        <div className="py-4 flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-950 to-[#0e1628] border border-sky-500/30 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(56,189,248,0.15)]">
            {getManeuverIcon(currentStep.action)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-sky-400">
                STEP {currentStepIndex + 1} OF {route.steps.length}
              </span>
              {currentStep.distanceMeters > 0 && (
                <span className="text-[11px] font-mono font-semibold text-emerald-400 tabular-nums">
                  · {currentStep.distanceMeters}m ahead
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-white leading-snug">
              {currentStep.instruction}
            </h3>

            {currentStep.landmarkNote && (
              <p className="text-xs text-sky-300/90 mt-1 flex items-center gap-1 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Passing: {currentStep.landmarkNote}</span>
              </p>
            )}
          </div>
        </div>

        {/* Next Step Preview */}
        {nextStep && (
          <div className="px-3.5 py-2.5 bg-slate-950/80 rounded-2xl border border-slate-800/80 mb-3 text-xs flex items-center justify-between text-slate-400 shadow-inner">
            <span className="truncate">
              Then: <strong className="text-slate-200">{nextStep.instruction}</strong>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 text-sky-400" />
          </div>
        )}

        {/* Arrival Celebration Banner */}
        {isLastStep && (
          <div className="p-3.5 bg-emerald-950/70 border border-emerald-500/50 rounded-2xl mb-3 text-center shadow-[0_0_20px_rgba(16,185,129,0.25)]">
            <div className="flex items-center justify-center gap-1.5 text-emerald-300 font-bold text-xs mb-0.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>You Have Reached Your Destination!</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Welcome to {route.toName}. Wayfinding complete.
            </p>
          </div>
        )}

        {/* Step Navigation Controls */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onPrevStep}
            disabled={currentStepIndex === 0}
            className="p-2.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-800 rounded-xl transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          {/* Progress track */}
          <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
              style={{
                width: `${((currentStepIndex + 1) / route.steps.length) * 100}%`,
              }}
            />
          </div>

          <button
            onClick={onNextStep}
            disabled={isLastStep}
            className="py-2.5 px-4 bg-gradient-to-r from-sky-400 via-sky-300 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(56,189,248,0.3)] transition-all flex items-center gap-1 active:scale-95"
          >
            <span>Next Step</span>
            <ChevronRight className="w-4 h-4 text-slate-950" />
          </button>
        </div>
      </div>
    </div>
  );
};
