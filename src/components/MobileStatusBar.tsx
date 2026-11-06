import React from 'react';

interface MobileStatusBarProps {
  dark?: boolean;
}

export const MobileStatusBar: React.FC<MobileStatusBarProps> = ({ dark = false }) => {
  return (
    <div
      className={`h-9 px-6 flex items-center justify-between text-xs font-semibold select-none z-30 transition-colors ${
        dark ? 'text-white' : 'text-slate-900'
      }`}
    >
      {/* iOS Time indicator */}
      <span className="font-sans font-bold text-[13px] tracking-tight">9:41</span>

      {/* Cellular, Wifi & Battery icons */}
      <div className="flex items-center gap-1.5">
        <svg className="w-4 h-3 fill-current" viewBox="0 0 16 12">
          <circle cx="2" cy="10" r="1.5" />
          <circle cx="6" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
        </svg>
        <svg className="w-3.5 h-3 fill-current" viewBox="0 0 16 12">
          <path d="M 0 2 A 12 12 0 0 1 16 2 L 14 4 A 9 9 0 0 0 2 4 Z M 3 5 A 8 8 0 0 1 13 5 L 11 7 A 5 5 0 0 0 5 7 Z M 6 8 A 4 4 0 0 1 10 8 L 8 11 Z" />
        </svg>
        {/* Battery Container */}
        <div className="w-5 h-2.5 rounded-sm border border-current p-0.5 flex items-center">
          <div className="h-full w-full bg-current rounded-xs" />
        </div>
      </div>
    </div>
  );
};
