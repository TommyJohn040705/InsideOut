import React, { useState } from 'react';
import { ShieldCheck, Plus, Check, X, RotateCcw, AlertTriangle, Clock, MapPin, User, FileText } from 'lucide-react';
import { MapCorrectionSuggestion, CorrectionIssueType, RoomPOI } from '../types/navigation';
import { loadSuggestions, createSuggestion, approveSuggestion, rejectSuggestion, revertSuggestion, ISSUE_TYPE_LABELS } from '../utils/auditLog';

interface Props {
  open: boolean;
  onClose: () => void;
  activeFloor: number;
  allRooms: RoomPOI[];
  onApplyOverride: (roomId: string, patch: Partial<RoomPOI>) => void;
}

export function CorrectionsAuditModal({ open, onClose, activeFloor, allRooms, onApplyOverride }: Props) {
  const [tab, setTab] = useState<'pending' | 'history' | 'new'>('pending');
  const [suggestions, setSuggestions] = useState<MapCorrectionSuggestion[]>(() => loadSuggestions());

  // Form state for creating a new suggestion
  const [newType, setNewType] = useState<CorrectionIssueType>('incorrect_room');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [proposedName, setProposedName] = useState('');
  const [proposedPurpose, setProposedPurpose] = useState('');

  if (!open) return null;

  const refreshList = () => {
    setSuggestions(loadSuggestions());
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) return;

    const matchedRoom = allRooms.find((r) => r.id === newRoomId);

    const proposedChanges = (proposedName.trim() || proposedPurpose.trim()) ? {
      name: proposedName.trim() || undefined,
      purpose: proposedPurpose.trim() || undefined,
    } : undefined;

    const originalSnapshot = matchedRoom ? {
      name: matchedRoom.name,
      purpose: matchedRoom.purpose,
      category: matchedRoom.category,
      accessible: matchedRoom.accessible,
      coords: matchedRoom.coords,
    } : undefined;

    createSuggestion({
      type: newType,
      title: newTitle,
      description: newDesc,
      floor: matchedRoom?.floor || activeFloor,
      roomId: matchedRoom?.id,
      roomNumber: matchedRoom?.roomNumber,
      author: newAuthor,
      proposedChanges,
      originalSnapshot,
    });

    // Reset form
    setNewTitle('');
    setNewDesc('');
    setNewRoomId('');
    setProposedName('');
    setProposedPurpose('');
    refreshList();
    setTab('pending');
  };

  const handleApprove = (id: string) => {
    approveSuggestion(id, 'Approved by reviewer', onApplyOverride);
    refreshList();
  };

  const handleReject = (id: string) => {
    rejectSuggestion(id, 'Rejected by reviewer');
    refreshList();
  };

  const handleRevert = (id: string) => {
    revertSuggestion(id, onApplyOverride);
    refreshList();
  };

  const pendingList = suggestions.filter((s) => s.status === 'pending');
  const historyList = suggestions.filter((s) => s.status !== 'pending');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl h-[88dvh] sm:h-[680px] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-slate-900 text-base">Map Corrections & Audit Review</h3>
            <p className="text-xs text-slate-500">Peer review and rollback audit trail for E5 indoor geometry and facilities</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-slate-100 px-4 pt-2 gap-2 text-sm bg-slate-50/50">
          <button
            onClick={() => setTab('pending')}
            className={`pb-2.5 font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              tab === 'pending' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Pending Review ({pendingList.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`pb-2.5 font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              tab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Audit History & Rollback ({historyList.length})
          </button>
          <button
            onClick={() => setTab('new')}
            className={`pb-2.5 font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              tab === 'new' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" /> Suggest Correction
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'pending' && (
            <div className="space-y-3">
              {pendingList.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <ShieldCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-slate-700">No pending map corrections</p>
                  <p className="text-xs text-slate-500 mt-1">All proposed modifications have been reviewed.</p>
                </div>
              ) : (
                pendingList.map((sug) => (
                  <div key={sug.id} className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white space-y-3 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {ISSUE_TYPE_LABELS[sug.type] || sug.type}
                          </span>
                          <span className="text-xs text-slate-500">Floor {sug.floor}</span>
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-base">{sug.title}</h4>
                      </div>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(sug.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 leading-snug">{sug.description}</p>

                    {sug.proposedChanges && (
                      <div className="p-2.5 bg-slate-50 rounded-xl text-xs space-y-1 border border-slate-100">
                        <p className="font-bold text-slate-700">Proposed modifications:</p>
                        {sug.proposedChanges.name && <p className="text-slate-600">Name: <span className="font-semibold text-slate-900">{sug.proposedChanges.name}</span></p>}
                        {sug.proposedChanges.purpose && <p className="text-slate-600">Purpose: <span className="font-semibold text-slate-900">{sug.proposedChanges.purpose}</span></p>}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 flex items-center gap-1">
                        <User className="w-3.5 h-3.5" /> {sug.author}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(sug.id)}
                          className="h-8 px-3 rounded-lg ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-bold flex items-center gap-1 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                        <button
                          onClick={() => handleApprove(sug.id)}
                          className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve & Apply
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              {historyList.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-slate-700">No review history yet</p>
                </div>
              ) : (
                historyList.map((sug) => (
                  <div key={sug.id} className="p-4 rounded-2xl ring-1 ring-slate-200 bg-white space-y-3 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              sug.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : sug.status === 'reverted'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {sug.status.toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500">Floor {sug.floor}</span>
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-base">{sug.title}</h4>
                      </div>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">
                        {sug.reviewedAt ? new Date(sug.reviewedAt).toLocaleDateString() : ''}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 leading-snug">{sug.description}</p>
                    {sug.reviewNotes && (
                      <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg italic">
                        Reviewer note: {sug.reviewNotes}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Author: {sug.author}</span>
                      {sug.status === 'approved' && (
                        <button
                          onClick={() => handleRevert(sug.id)}
                          className="h-8 px-3 rounded-lg ring-1 ring-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Rollback Changes
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'new' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Issue Category</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as CorrectionIssueType)}
                  className="w-full h-11 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-800 outline-none"
                >
                  {Object.entries(ISSUE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Associated Room (Optional)</label>
                <select
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value)}
                  className="w-full h-11 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-800 outline-none"
                >
                  <option value="">None / General Corridor</option>
                  {allRooms.slice(0, 100).map((r) => (
                    <option key={r.id} value={r.id}>
                      E5 {r.roomNumber || ''} · {r.name} (L{r.floor})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Summary Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Corridor door locked near 3101"
                  required
                  className="w-full h-11 rounded-xl ring-1 ring-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Explain what needs correcting on the drawing..."
                  rows={3}
                  required
                  className="w-full rounded-xl ring-1 ring-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Proposed Name (Optional)</label>
                  <input
                    value={proposedName}
                    onChange={(e) => setProposedName(e.target.value)}
                    placeholder="Updated room name"
                    className="w-full h-11 rounded-xl ring-1 ring-slate-200 px-3 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Your Name / Role</label>
                  <input
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    placeholder="e.g. Lab Tech / Student"
                    className="w-full h-11 rounded-xl ring-1 ring-slate-200 px-3 text-sm outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 shadow mt-4 transition-colors"
              >
                <Plus className="w-5 h-5" /> Submit for Map Review
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
