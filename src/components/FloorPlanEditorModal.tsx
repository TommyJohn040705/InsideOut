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
      // an edit by a person is a staff report; official status stays only if the text is unchanged
      ...(purpose !== (room.purpose || '') || name !== room.name || category !== room.category
        ? { purposeVerification: 'staff_reported' as const, reportedAt: new Date().toISOString() }
        : {}),
    };
    onSaveRoom(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-50/50 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-blue-700 flex items-center justify-center border border-slate-200">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">Edit room</h3>
              <p className="text-sm text-slate-500">
                Floor {room.floor} · CAD ID {room.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                Room Number
              </label>
              <input
                type="text"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500"
                placeholder="e.g. 3101"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as POICategory)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500"
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
            <label className="text-xs text-slate-500 block mb-1">
              Descriptive Title / Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500"
              placeholder="e.g. Department Lecture Hall E5-3101"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">
              What the room is used for
            </label>
            <textarea
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-sky-500 leading-relaxed"
              placeholder="e.g. Custodian closet, keys at the 2nd floor front desk"
            />
          </div>

          <p className="text-sm text-slate-500">To move this room on the map, turn on <b>Edit map</b> and drag its label.</p>

          {/* Verification & Accessibility Toggles */}
          <div className="space-y-2 pt-1">


            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={accessible}
                onChange={(e) => setAccessible(e.target.checked)}
                className="w-5 h-5 rounded text-blue-600 bg-slate-50 border-slate-200 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700">
                Barrier-free wheelchair accessible entrance
              </span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-sm font-bold bg-[#ecc94b] hover:bg-[#d8b538] text-slate-950 flex items-center gap-1.5 transition-colors shadow-md"
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
