import React, { useMemo, useState } from 'react';
import {
  GraduationCap, Wrench, Briefcase, CheckCircle2, Circle, Navigation2, ExternalLink,
  ShieldAlert, Phone, Clock, Key, Printer, Coffee, AlertTriangle, ChevronRight,
  Tv, Mic, Laptop, HelpCircle, Search, Sparkles, X, MapPin, Building,
  ArrowRight, Radio, Compass, FileText, Check, AlertCircle, Info,
} from 'lucide-react';
import {
  StaffRole, STAFF_ROLES, ONBOARDING_TASKS, OnboardingTask,
  CLASSROOM_SPECS, EMERGENCY_POINTS, WATERLOO_KEY_CONTACTS, DAY1_TOURS,
} from '../data/waterlooStaffData';
import { RoomPOI } from '../types/navigation';

interface WorkplaceCompanionModalProps {
  open: boolean;
  onClose: () => void;
  role: StaffRole;
  onChangeRole: () => void;
  completedTasks: string[];
  onToggleTask: (taskId: string) => void;
  onNavigateToRoom: (roomId: string, floor: number) => void;
  onStartDay1Tour: () => void;
  onOpenReportModal?: (prefilledRoomId?: string, defaultCategory?: string) => void;
  onToggleSafetyOverlay?: () => void;
  safetyOverlayActive?: boolean;
}

type TabType = 'checklist' | 'classrooms' | 'resources' | 'safety' | 'contacts';

export function WorkplaceCompanionModal({
  open,
  onClose,
  role,
  onChangeRole,
  completedTasks,
  onToggleTask,
  onNavigateToRoom,
  onStartDay1Tour,
  onOpenReportModal,
  onToggleSafetyOverlay,
  safetyOverlayActive,
}: WorkplaceCompanionModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('checklist');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<'all' | 'day1' | 'week1' | 'month1'>('all');
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<string>('all');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('e5-3101');

  if (!open) return null;

  const roleConfig = STAFF_ROLES[role];
  const roleIcon = role === 'instructor' ? GraduationCap : role === 'contract' ? Wrench : Briefcase;

  // Filter tasks for current role and selected filters
  const roleTasks = ONBOARDING_TASKS.filter((t) => t.role === role || t.role === 'all');
  const filteredTasks = roleTasks.filter((t) => {
    if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false;
    if (taskCategoryFilter !== 'all' && t.category !== taskCategoryFilter) return false;
    return true;
  });

  const totalRoleTasks = roleTasks.length;
  const completedRoleTasksCount = roleTasks.filter((t) => completedTasks.includes(t.id)).length;
  const progressPercent = totalRoleTasks > 0 ? Math.round((completedRoleTasksCount / totalRoleTasks) * 100) : 0;

  // Filter contacts
  const filteredContacts = WATERLOO_KEY_CONTACTS.filter((c) => {
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return (
      c.department.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.urgentServices.toLowerCase().includes(q) ||
      c.ext.includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-[65] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Waterloo Engineering 5 Workplace Companion"
    >
      <div className="bg-white w-full h-[100dvh] sm:h-[90vh] sm:max-h-[820px] sm:max-w-4xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-200">
        {/* Top Header */}
        <div className="shrink-0 bg-slate-900 text-white p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  role === 'instructor'
                    ? 'bg-amber-400 text-slate-900'
                    : role === 'contract'
                    ? 'bg-emerald-400 text-slate-900'
                    : 'bg-blue-400 text-slate-900'
                }`}
              >
                {React.createElement(roleIcon, { className: 'w-5 h-5' })}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold tracking-tight truncate">
                    E5 Workplace Companion
                  </h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 hidden sm:inline-block">
                    {roleConfig.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate">
                  First few weeks at University of Waterloo Engineering 5
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onChangeRole}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                title="Switch your role"
              >
                Switch Role
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar mt-4 pt-1 border-t border-slate-800/80 -mx-1 px-1">
            <button
              onClick={() => setActiveTab('checklist')}
              className={`h-9 px-3.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                activeTab === 'checklist'
                  ? 'bg-amber-400 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Onboarding Checklist</span>
              <span
                className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'checklist' ? 'bg-amber-300 text-slate-900' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {completedRoleTasksCount}/{totalRoleTasks}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('classrooms')}
              className={`h-9 px-3.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                activeTab === 'classrooms'
                  ? 'bg-amber-400 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>Classroom & AV Podiums</span>
            </button>

            <button
              onClick={() => setActiveTab('resources')}
              className={`h-9 px-3.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                activeTab === 'resources'
                  ? 'bg-amber-400 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Building className="w-4 h-4" />
              <span>Access & Workplace</span>
            </button>

            <button
              onClick={() => setActiveTab('safety')}
              className={`h-9 px-3.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                activeTab === 'safety'
                  ? 'bg-amber-400 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Safety & Transit</span>
            </button>

            <button
              onClick={() => setActiveTab('contacts')}
              className={`h-9 px-3.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                activeTab === 'contacts'
                  ? 'bg-amber-400 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Phone className="w-4 h-4" />
              <span>Staff Contacts</span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {/* TAB 1: ONBOARDING CHECKLIST */}
          {activeTab === 'checklist' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* Progress & Day 1 Tour banner */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs ring-1 ring-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                      <span>{roleConfig.label} Onboarding Checklist</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {progressPercent}% Complete
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Check off important locations and services as you visit them during your first weeks.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      onStartDay1Tour();
                    }}
                    className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs shrink-0 transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Start Day 1 Orientation Route</span>
                  </button>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Filter pills */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {(['all', 'day1', 'week1', 'month1'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setTaskPriorityFilter(p)}
                      className={`h-8 px-3 rounded-full text-xs font-bold capitalize transition-colors ${
                        taskPriorityFilter === p
                          ? 'bg-slate-900 text-white'
                          : 'bg-white ring-1 ring-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p === 'all' ? 'All Priorities' : p.replace(/(\d+)/, ' $1')}
                    </button>
                  ))}
                </div>

                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {(['all', 'teaching', 'access', 'workplace', 'safety', 'transit'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setTaskCategoryFilter(c)}
                      className={`h-8 px-3 rounded-full text-xs font-semibold capitalize transition-colors ${
                        taskCategoryFilter === c
                          ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                          : 'bg-white ring-1 ring-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {c === 'all' ? 'All Categories' : c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tasks list */}
              <div className="space-y-3">
                {filteredTasks.map((task) => {
                  const isDone = completedTasks.includes(task.id);

                  return (
                    <div
                      key={task.id}
                      className={`bg-white rounded-2xl p-4 sm:p-5 ring-1 transition-all ${
                        isDone
                          ? 'ring-slate-200 bg-slate-50/70 opacity-90'
                          : 'ring-slate-200 shadow-xs hover:ring-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <button
                          onClick={() => onToggleTask(task.id)}
                          className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0"
                          aria-label={isDone ? 'Mark task incomplete' : 'Mark task complete'}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 hover:text-slate-400" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                task.priority === 'day1'
                                  ? 'bg-rose-100 text-rose-800'
                                  : task.priority === 'week1'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {task.priority === 'day1' ? 'First Day Essential' : task.priority === 'week1' ? 'Week 1' : 'First Month'}
                            </span>

                            <span className="text-xs font-semibold text-slate-500">
                              Floor {task.floor} · {task.locationName}
                            </span>
                          </div>

                          <h4
                            className={`text-[15px] font-bold leading-snug ${
                              isDone ? 'line-through text-slate-500' : 'text-slate-900'
                            }`}
                          >
                            {task.title}
                          </h4>

                          <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                            {task.description}
                          </p>

                          {/* Waterloo Pro Tip Box */}
                          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-950 flex items-start gap-2">
                            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold">Waterloo Pro Tip: </span>
                              <span>{task.proTip}</span>
                            </div>
                          </div>

                          {/* Contact or External link */}
                          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-100 text-xs">
                            {task.contact ? (
                              <span className="text-slate-500 truncate font-mono text-[11px]">
                                {task.contact}
                              </span>
                            ) : task.externalUrl ? (
                              <a
                                href={task.externalUrl.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-700 hover:text-blue-900 font-semibold inline-flex items-center gap-1"
                              >
                                {task.externalUrl.title} <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span />
                            )}

                            {task.roomId && (
                              <button
                                onClick={() => {
                                  onClose();
                                  onNavigateToRoom(task.roomId!, task.floor);
                                }}
                                className="h-8 px-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                              >
                                <Navigation2 className="w-3.5 h-3.5 fill-current" />
                                <span>Navigate There</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CLASSROOM & AV PODIUMS */}
          {activeTab === 'classrooms' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              {/* Emergency AV Hotline Banner */}
              <div className="bg-gradient-to-r from-rose-900 to-rose-800 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-rose-200" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base">Classroom Tech Emergency Hotline</h3>
                    <p className="text-xs text-rose-100 mt-0.5">
                      Projector dead, microphone missing, or Crestron frozen during lecture?
                    </p>
                    <p className="text-xs font-mono font-bold mt-1 text-amber-200">
                      Podium Speed-Dial: ext. 44357 · Mobile: 519-888-4567 ext. 44357
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="tel:5198884567,44357"
                    className="h-9 px-4 rounded-xl bg-white text-rose-900 font-bold text-xs inline-flex items-center gap-1.5 hover:bg-rose-50 transition-colors shadow-xs"
                  >
                    <Phone className="w-3.5 h-3.5 fill-current" />
                    <span>Call AV Desk</span>
                  </a>
                  {onOpenReportModal && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenReportModal(selectedClassroom, 'maintenance');
                      }}
                      className="h-9 px-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs border border-rose-500/50 transition-colors"
                    >
                      Report Issue
                    </button>
                  )}
                </div>
              </div>

              {/* Classroom selector buttons */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {Object.keys(CLASSROOM_SPECS).map((id) => {
                  const spec = CLASSROOM_SPECS[id];
                  const active = selectedClassroom === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedClassroom(id)}
                      className={`shrink-0 px-4 py-2.5 rounded-xl text-left border transition-all ${
                        active
                          ? 'border-blue-600 bg-blue-50/80 shadow-xs ring-1 ring-blue-500/40'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <p className={`text-xs font-extrabold ${active ? 'text-blue-900' : 'text-slate-900'}`}>
                        E5 {spec.roomNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate max-w-[130px]">
                        Floor {spec.floor} · {spec.capacity} seats
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Detailed Specs for selected room */}
              {(() => {
                const spec = CLASSROOM_SPECS[selectedClassroom] || CLASSROOM_SPECS['e5-3101'];
                return (
                  <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                          <h3 className="text-xl font-extrabold text-slate-900">{spec.name}</h3>
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {spec.capacity} seats
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Floor {spec.floor} · {spec.wheelchairAccessible ? 'Wheelchair Accessible Rows' : 'Standard Access'}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          onClose();
                          onNavigateToRoom(spec.roomId, spec.floor);
                        }}
                        className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center justify-center gap-2 shadow-xs transition-colors shrink-0"
                      >
                        <Navigation2 className="w-4 h-4 fill-current" />
                        <span>Navigate to Room</span>
                      </button>
                    </div>

                    {/* Spec Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-3.5 rounded-xl bg-slate-50 ring-1 ring-slate-200/70 space-y-1">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Tv className="w-4 h-4 text-blue-600" /> Podium & Display System
                        </span>
                        <p className="text-slate-700 pt-1 leading-snug">{spec.podiumModel}</p>
                        <p className="text-slate-500 text-[11px]">{spec.displaySetup}</p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 ring-1 ring-slate-200/70 space-y-1">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Mic className="w-4 h-4 text-purple-600" /> Audio & Microphones
                        </span>
                        <p className="text-slate-700 pt-1 leading-snug">{spec.audioSetup}</p>
                        <p className="text-slate-500 text-[11px]">
                          Wireless lavalier beltpack is kept inside the podium top drawer.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 ring-1 ring-slate-200/70 space-y-1">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Laptop className="w-4 h-4 text-emerald-600" /> Connectivity & Ports
                        </span>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {spec.connectivity.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-semibold text-slate-700 text-[11px]">
                              {c}
                            </span>
                          ))}
                        </div>
                        <p className="text-slate-500 text-[11px] mt-1">{spec.computerSpecs}</p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 ring-1 ring-slate-200/70 space-y-1">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-amber-600" /> Teaching Tools & Board
                        </span>
                        <p className="text-slate-700 pt-1 leading-snug">{spec.whiteboards}</p>
                        <p className="text-slate-500 text-[11px]">
                          Lecture capture enabled: {spec.lectureCapture ? 'Yes (automatic camera tracking)' : 'No'} · Document Camera: {spec.docCamera ? 'Yes (WolfVision / Elmo)' : 'No'}
                        </p>
                      </div>
                    </div>

                    {/* Step-by-step podium guide */}
                    <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200/80 text-xs text-blue-950 space-y-2">
                      <h4 className="font-extrabold text-blue-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" /> 30-Second Quick Start Guide for E5 Podiums:
                      </h4>
                      <ol className="list-decimal pl-4 space-y-1 text-blue-900/90 leading-relaxed">
                        <li><b>Wake the Screen:</b> Tap the Crestron touch panel once to wake from standby mode.</li>
                        <li><b>Choose Your Source:</b> Tap "Podium PC" for built-in presentation, or plug your laptop HDMI / USB-C cable and tap "Laptop".</li>
                        <li><b>Send to Projectors:</b> Tap "Projector 1 ON" and "Projector 2 ON" to lower the motorized screens and turn on laser bulbs.</li>
                        <li><b>Microphone Check:</b> Turn the power switch ON on the wireless beltpack. The audio level meter will register green on the touch screen.</li>
                        <li><b>When Finished:</b> Tap "System Shutdown" in the top right corner to raise screens and conserve projector bulbs.</li>
                      </ol>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 3: WORKPLACE RESOURCES & ACCESS */}
          {activeTab === 'resources' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* After-hours and security rules */}
              <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
                    <Key className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Building Access & Hours (WatCard)</h3>
                    <p className="text-xs text-slate-500">How to enter and access restricted areas in Engineering 5</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-blue-600" /> Regular Hours
                    </span>
                    <p className="text-slate-600">
                      <b>Monday – Friday:</b> 07:00 – 19:00 (exterior doors open to public).
                    </p>
                    <p className="text-slate-500 text-[11px] mt-1">
                      Level 2 Main Entrance (facing Davis Centre) and Level 1 East Concourse doors are unlocked.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> After-Hours & Weekends
                    </span>
                    <p className="text-slate-600">
                      <b>After 19:00 & Weekends:</b> Exterior doors lock automatically.
                    </p>
                    <p className="text-slate-500 text-[11px] mt-1">
                      Tap your authorized WatCard on the wall badge reader at the Level 2 Main Entrance or East Ground door.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 text-xs text-amber-950 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Access Card Not Working? </span>
                    <span>
                      Exterior access is managed by Waterloo Security Systems (CCURE). Your departmental administrative assistant (MME / ECE / Systems Design) must submit an electronic access ticket with your 8-digit WatCard ID.
                    </span>
                  </div>
                </div>
              </div>

              {/* Printing & Photocopying (uPrint) */}
              <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
                    <Printer className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Printing, Photocopying & uPrint</h3>
                    <p className="text-xs text-slate-500">Wireless card-tap printing across Engineering 5</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-700 leading-relaxed">
                  <p>
                    Waterloo uses <b>PaperCut uPrint</b>. You can send documents from any laptop or mobile phone to the campus cloud queue, then tap your WatCard at any multi-function machine to release:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    <li><b>Primary E5 Station:</b> Level 2 inside the Gear Computer Lab (Room 2108) — high-speed color & B/W.</li>
                    <li><b>Departmental Copy Hubs:</b> Level 3 MME administration wing and Level 6 Systems Design office.</li>
                    <li><b>High-Volume Course Packs:</b> Send print orders directly to W Print (Central Stores) for next-day faculty delivery.</li>
                  </ul>
                </div>
              </div>

              {/* Staff Lounges & Kitchenettes */}
              <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
                    <Coffee className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Staff Lounges, Microwaves & Lunch</h3>
                    <p className="text-xs text-slate-500">Where to heat lunch, grab coffee, and recharge</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70">
                    <span className="font-bold text-slate-900">Level 3 Kitchenette & Commons (3812A)</span>
                    <p className="text-slate-600 mt-1">
                      Staff microwave, full-size refrigerator, hot water kettle, and Brita hydration station. Open to all department personnel.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70">
                    <span className="font-bold text-slate-900">Level 6 Upper Lounge & Vending</span>
                    <p className="text-slate-600 mt-1">
                      Cold beverage & snack vending machines. Quiet high-top counters with expansive views of the campus ring.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-50 text-xs text-blue-950 flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">No food outlets inside E5: </span>
                    <span>
                      Walk across the pedestrian link to Engineering 7 for the E7 Atrium Food Court, or cross the tracks to University Plaza for 20+ restaurants.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SAFETY, EMERGENCY & TRANSIT */}
          {activeTab === 'safety' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* Emergency Contacts Callout */}
              <div className="bg-rose-900 text-white rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-rose-300" />
                    <h3 className="text-base font-extrabold">Emergency Safety Contacts</h3>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-rose-800 text-rose-200 border border-rose-700">
                    24/7 Response
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/60">
                    <p className="font-extrabold text-amber-300 text-sm">Campus Police (Immediate Emergency)</p>
                    <p className="text-rose-100 mt-1">Dial <b>22222</b> on any campus phone</p>
                    <p className="text-rose-200 text-[11px]">Mobile: 519-888-4911</p>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/60">
                    <p className="font-extrabold text-amber-300 text-sm">Plant Operations (Maintenance & Spills)</p>
                    <p className="text-rose-100 mt-1">Dial <b>33793</b> on campus phone</p>
                    <p className="text-rose-200 text-[11px]">Direct: 519-888-4567 ext. 33793</p>
                  </div>
                </div>
              </div>

              {/* Safety Overlay Toggle */}
              {onToggleSafetyOverlay && (
                <div className="bg-white rounded-2xl p-4 ring-1 ring-slate-200 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Map Safety Overlay</p>
                      <p className="text-xs text-slate-500">Show AEDs, First Aid stations, and emergency exits on floor map</p>
                    </div>
                  </div>

                  <button
                    onClick={onToggleSafetyOverlay}
                    className={`h-9 px-4 rounded-full text-xs font-bold transition-all shadow-xs ${
                      safetyOverlayActive
                        ? 'bg-rose-600 text-white'
                        : 'bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {safetyOverlayActive ? 'Overlay ON' : 'Turn ON Overlay'}
                  </button>
                </div>
              )}

              {/* AED and Emergency Directory */}
              <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-xs space-y-3">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>AEDs & First Aid Stations in E5</span>
                </h3>

                <div className="space-y-2 text-xs">
                  {EMERGENCY_POINTS.map((pt) => (
                    <div
                      key={pt.id}
                      className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-xs ${
                            pt.type === 'aed'
                              ? 'bg-rose-600'
                              : pt.type === 'first-aid'
                              ? 'bg-emerald-600'
                              : pt.type === 'exit'
                              ? 'bg-blue-600'
                              : 'bg-teal-600'
                          }`}
                        >
                          {pt.type === 'aed' ? 'AED' : pt.type === 'first-aid' ? 'FA' : pt.type === 'exit' ? 'EXIT' : 'EYE'}
                        </span>

                        <div>
                          <p className="font-bold text-slate-900">{pt.name}</p>
                          <p className="text-slate-600 text-[11px] mt-0.5">{pt.description}</p>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                            Floor {pt.floor} · {pt.closestRoomNumber ? `Near Room ${pt.closestRoomNumber}` : 'Hallway'}
                          </span>
                        </div>
                      </div>

                      {pt.closestRoomNumber && (
                        <button
                          onClick={() => {
                            onClose();
                            onNavigateToRoom(`e5-${pt.closestRoomNumber}`, pt.floor);
                          }}
                          className="h-7 px-2.5 rounded-full bg-white ring-1 ring-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                        >
                          <Navigation2 className="w-3 h-3 fill-current" />
                          <span>View</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Transit & Commuting */}
              <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
                    <Radio className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Transit, ION LRT & Staff Parking</h3>
                    <p className="text-xs text-slate-500">Commuting to and from Waterloo Engineering 5</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70">
                    <p className="font-bold text-slate-900">ION Light Rail (LRT)</p>
                    <p className="text-slate-600 mt-1 leading-snug">
                      <b>University of Waterloo Station</b> is directly south of E5 across Ring Road (3-minute walk). Connects Conestoga Mall to Fairview Park Mall via Kitchener.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70">
                    <p className="font-bold text-slate-900">Staff Parking (Lots B, C & Q)</p>
                    <p className="text-slate-600 mt-1 leading-snug">
                      Permits managed by Parking Services (GSC). Lot B & C are adjacent to E5/E7. Daily scratch vouchers available at the Parking Services kiosk.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: STAFF CONTACTS */}
          {activeTab === 'contacts' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search department, role, or extension (e.g. 'AV', 'Key', '44357')..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-3">
                {filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="bg-white rounded-2xl p-4 sm:p-5 ring-1 ring-slate-200 shadow-xs space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-extrabold text-slate-900">{contact.department}</h4>
                        <p className="text-xs font-semibold text-blue-700">{contact.role}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                          ext. {contact.ext}
                        </span>
                        <a
                          href={`tel:${contact.phone.replace(/[^0-9]/g, '')}`}
                          className="h-7 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold inline-flex items-center gap-1 transition-colors"
                        >
                          <Phone className="w-3 h-3 fill-current" /> Call
                        </a>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {contact.urgentServices}
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
                      <span>Office: {contact.office}</span>
                      <span>Hours: {contact.hours}</span>
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-blue-700 hover:underline font-semibold"
                      >
                        {contact.email}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 bg-white px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Waterloo Engineering 5 Workplace Guide</span>
          </div>

          <button
            onClick={onClose}
            className="h-8 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
