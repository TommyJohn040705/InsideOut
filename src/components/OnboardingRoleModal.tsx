import React from 'react';
import {
  GraduationCap, Wrench, Briefcase, CheckCircle2, ArrowRight, X, Sparkles, MapPin, Building2,
} from 'lucide-react';
import { StaffRole, STAFF_ROLES } from '../data/waterlooStaffData';

interface OnboardingRoleModalProps {
  open: boolean;
  onClose: () => void;
  currentRole: StaffRole | null;
  onSelectRole: (role: StaffRole, startTourImmediately?: boolean) => void;
}

export function OnboardingRoleModal({ open, onClose, currentRole, onSelectRole }: OnboardingRoleModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to University of Waterloo Engineering 5"
    >
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden ring-1 ring-slate-200 animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header with Waterloo Engineering brand vibe */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950 text-white p-6 pb-7">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-amber-400 text-slate-900 flex items-center justify-center font-extrabold text-xs tracking-wider shadow-sm">
                UW
              </span>
              <span className="text-xs uppercase tracking-widest font-bold text-amber-300">Engineering 5 (E5)</span>
            </div>
            {currentRole && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
            Welcome to Waterloo!
          </h2>
          <p className="text-sm sm:text-base text-slate-300 mt-2 leading-relaxed">
            Get familiar with your workplace in Engineering 5. What best describes your role on campus?
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="p-6 space-y-3.5">
          {(Object.keys(STAFF_ROLES) as StaffRole[]).map((roleKey) => {
            const role = STAFF_ROLES[roleKey];
            const isSelected = currentRole === roleKey;
            const Icon = roleKey === 'instructor' ? GraduationCap : roleKey === 'contract' ? Wrench : Briefcase;

            return (
              <div
                key={roleKey}
                onClick={() => onSelectRole(roleKey, false)}
                className={`group relative text-left p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-400/50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      roleKey === 'instructor'
                        ? 'bg-amber-100 text-amber-800'
                        : roleKey === 'contract'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-slate-900 leading-snug group-hover:text-blue-900 transition-colors">
                        {role.label}
                      </h3>
                      <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {role.badge}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-snug">
                      {role.subtitle}
                    </p>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-slate-200/70">
                      {role.recommendedHighlights.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="shrink-0 self-center pl-2">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-0.5 ${
                        isSelected ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:text-slate-700'
                      }`}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info & guided tour prompt */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Engineering 5 · Floors 1 to 6 · University of Waterloo</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectRole(currentRole || 'instructor', true)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Start Day 1 Orientation Route
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
