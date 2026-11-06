import React, { useState, useEffect } from 'react';
import { X, Check, Edit3, MapPin, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { RoomPOI, POICategory } from '../types/navigation';

interface FloorPlanEditorModalProps {
  isOpen: boolean;
  room: RoomPOI | null;
  onClose: () => void;
  onSaveRoom: (updatedRoom: RoomPOI) => void;
}

export const FloorPlanEditorModal: React.FC<FloorPlanEditorModalProps> = ({
  isOpen,
  room,
  onClose,
  onSaveRoom,
}) => {
  const [name, setName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [category, setCategory] = useState<POICategory>('office');
  const [x, setX] = useState<number>(50);
  const [y, setY] = useState<number>(50);
  const [accessible, setAccessible] = useState(true);
  const [isPurposeVerified, setIsPurposeVerified] = useState(false);

  useEffect(() => {
    if (room) {
      setName(room.name);
      setRoomNumber(room.roomNumber || '');
      setPurpose(room.purpose || '');
      setCategory(room.category);
      setX(room.coords.x);
      setY(room.coords.y);
      setAccessible(room.accessible !== false);
      setIsPurposeVerified(room.purposeVerification === 'verified_official_source');
    }
  }, [room]);

  if (!isOpen || !room) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: RoomPOI = {
      ...room,
      name,
      roomNumber,
      purpose,
      category,
      coords: { x: Number(x), y: Number(y) },
      accessible,
      purposeVerification: isPurposeVerified ? 'verified_official_source' : 'unverified_drawing_only',
    };
    onSaveRoom(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0d1527] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Edit Room Annotation</h3>
              <p className="text-xs text-slate-400">
                Floor {room.floor} · CAD ID {room.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                Room Number
              </label>
              <input
                type="text"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-sky-500"
                placeholder="e.g. 3101"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as POICategory)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-sky-500"
              >
                <option value="classroom">Classroom / Lecture</option>
                <option value="workshop">Workshop / Machine Shop</option>
                <option value="lab">Research / Computing Lab</option>
                <option value="office">Faculty / Department Office</option>
                <option value="restroom">Washroom</option>
                <option value="elevator">Elevator</option>
                <option value="stairs">Stairwell</option>
                <option value="entrance">Entrance / Lobby</option>
                <option value="study">Study Area</option>
                <option value="bridge">Bridge / Overpass</option>
                <option value="other">Other Facility</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">
              Descriptive Title / Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-sky-500"
              placeholder="e.g. Department Lecture Hall E5-3101"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 block mb-1">
              Verified Purpose / Equipment
            </label>
            <textarea
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-sky-500 leading-relaxed"
              placeholder="Enter official equipment, capacity, or laboratory purpose..."
            />
          </div>

          {/* Coordinate Adjustment */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
            <span className="text-[11px] font-mono uppercase text-slate-400 block">
              Floor Plan Coordinates (0% - 100%)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">X (% from left)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={x}
                  onChange={(e) => setX(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Y (% from top)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={y}
                  onChange={(e) => setY(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Verification & Accessibility Toggles */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPurposeVerified}
                onChange={(e) => setIsPurposeVerified(e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-700 focus:ring-sky-500"
              />
              <span className="text-xs text-slate-300">
                Mark purpose as verified from official Waterloo documentation
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={accessible}
                onChange={(e) => setAccessible(e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-700 focus:ring-sky-500"
              />
              <span className="text-xs text-slate-300">
                Barrier-free wheelchair accessible entrance
              </span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#ecc94b] hover:bg-[#d8b538] text-slate-950 flex items-center gap-1.5 transition-colors shadow-md"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
