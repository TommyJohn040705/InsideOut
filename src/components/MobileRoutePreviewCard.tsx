import React from 'react';
import { ArrowUpDown, ArrowLeft } from 'lucide-react';
import { NavigationRoute } from '../types/navigation';
import { MobileStatusBar } from './MobileStatusBar';

interface MobileRoutePreviewCardProps {
  route: NavigationRoute;
  onSwapPoints: () => void;
  onStartNavigation: () => void;
  onBackToExplore: () => void;
}

export const MobileRoutePreviewCard: React.FC<MobileRoutePreviewCardProps> = ({
  route,
  onSwapPoints,
  onStartNavigation,
  onBackToExplore,
}) => {
  return (
    <>
      {/* Top Floating Origin & Destination Card (Screen 3) */}
      <div className="absolute top-0 left-0 right-0 z-30 pt-1 pointer-events-none">
        <MobileStatusBar dark={false} />

        <div className="px-4 pt-1 pointer-events-auto">
          <div className="w-full max-w-sm mx-auto bg-white rounded-2xl shadow-lg border border-slate-100 p-3.5 flex items-center justify-between">
            <div className="flex-1 space-y-2.5 pr-2">
              {/* Origin Row: Green Dot */}
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#15803d] ring-2 ring-emerald-500/20 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  {route.fromName}
                </span>
              </div>

              {/* Hairline Divider */}
              <div className="h-px bg-slate-100 ml-5.5" />

              {/* Destination Row: Red Dot */}
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444] ring-2 ring-rose-500/20 shrink-0" />
                <span className="text-xs font-bold text-slate-800 truncate">
                  {route.toName}
                </span>
              </div>
            </div>

            {/* Swap Button on Right */}
            <button
              onClick={onSwapPoints}
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors ml-1"
              title="Reverse Start and Destination"
              aria-label="Reverse Start and Destination"
            >
              <ArrowUpDown className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Sheet for Route Metrics & Start CTA (Screen 3) */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-3xl shadow-[0_-10px_35px_rgba(0,0,0,0.1)] p-5 border-t border-slate-100 animate-in slide-in-from-bottom-6 duration-200">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />

        {/* Time and Distance */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {Math.max(1, Math.round(route.estimatedWalkTimeMinutes))} min
          </span>
          <span className="text-sm font-semibold text-slate-500 font-mono">
            {route.totalDistanceMeters} m
          </span>
        </div>

        {/* Accessibility tag */}
        <div className="text-xs font-bold text-[#16a34a] mb-4">
          Step-free route
        </div>

        {/* Big Amber Start Button */}
        <button
          onClick={onStartNavigation}
          className="w-full py-4 bg-[#ecc94b] hover:bg-[#e2bd3a] text-slate-950 font-extrabold text-base rounded-2xl shadow-sm transition-all active:scale-[0.98] text-center"
        >
          Start
        </button>
      </div>
    </>
  );
};
