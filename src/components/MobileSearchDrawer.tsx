import React, { useState } from 'react';
import { ArrowLeft, MapPin, Users, Utensils, Building2, Search, X } from 'lucide-react';
import { FloorPlanData, RoomPOI } from '../types/navigation';
import { MobileStatusBar } from './MobileStatusBar';

interface MobileSearchDrawerProps {
  floorPlan: FloorPlanData;
  activeFilter: string;
  onSelectFilter: (filter: string) => void;
  onSelectDestination: (room: RoomPOI) => void;
  onClose: () => void;
}

export const MobileSearchDrawer: React.FC<MobileSearchDrawerProps> = ({
  floorPlan,
  activeFilter,
  onSelectFilter,
  onSelectDestination,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('Board');

  // Filter rooms based on query and optional category filter
  const filteredRooms = floorPlan.rooms.filter((room) => {
    const matchesQuery =
      searchQuery.trim() === '' ||
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (room.roomNumber && room.roomNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      room.category.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesQuery) return false;

    if (activeFilter === 'restroom') return room.category === 'restroom';
    if (activeFilter === 'food') return room.category === 'dining';
    if (activeFilter === 'elevators') return room.category === 'elevator' || room.category === 'stairs';

    return true;
  });

  // Calculate estimated walk time for display (1-2 mins for typical indoor)
  const getWalkTimeText = (room: RoomPOI) => {
    if (room.name.includes('Board Meeting') || room.name.includes('Breakout') || room.name.includes('Training')) {
      return '2 min';
    }
    return '1 min';
  };

  return (
    <div className="absolute inset-0 z-40 bg-white flex flex-col animate-in fade-in duration-200">
      {/* iOS Status Bar */}
      <MobileStatusBar dark={false} />

      {/* Top Search Input Row with Back Arrow (Screen 2) */}
      <div className="px-4 pt-1 pb-3 flex items-center gap-2.5">
        <button
          onClick={onClose}
          className="p-1.5 -ml-1 text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
          title="Back to Map"
          aria-label="Back to Map"
        >
          <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
        </button>

        <div className="flex-1 flex items-center px-4 py-2.5 bg-[#f0f3f0] rounded-full text-slate-900 border border-slate-200/60 shadow-inner">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rooms and places"
            autoFocus
            className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-700 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips Row (Screen 2) */}
      <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto border-b border-slate-100 select-none">
        <button
          onClick={() => onSelectFilter(activeFilter === 'restroom' ? 'all' : 'restroom')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            activeFilter === 'restroom'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Restrooms</span>
        </button>

        <button
          onClick={() => onSelectFilter(activeFilter === 'food' ? 'all' : 'food')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            activeFilter === 'food'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Utensils className="w-3.5 h-3.5" />
          <span>Food</span>
        </button>

        <button
          onClick={() => onSelectFilter(activeFilter === 'elevators' ? 'all' : 'elevators')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            activeFilter === 'elevators'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Elevators</span>
        </button>
      </div>

      {/* Directory Search Results Feed (Screen 2) */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {filteredRooms.map((room) => (
          <div
            key={room.id}
            onClick={() => onSelectDestination(room)}
            className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 cursor-pointer transition-colors active:bg-slate-100"
          >
            <div className="flex items-center gap-3.5 min-w-0 pr-3">
              {/* Circular Grey Badge with Pin Icon */}
              <div className="w-9 h-9 rounded-full bg-[#f0f3f0] flex items-center justify-center text-slate-500 shrink-0">
                <MapPin className="w-4 h-4 stroke-[2]" />
              </div>

              {/* Title & Subtitle */}
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900 leading-snug truncate">
                  {room.name}
                </h4>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {room.roomNumber || `${room.category.toUpperCase()} · Accessible`}
                </p>
              </div>
            </div>

            {/* Estimated Time Indicator on Right */}
            <span className="text-xs font-medium text-slate-400 shrink-0">
              {getWalkTimeText(room)}
            </span>
          </div>
        ))}

        {filteredRooms.length === 0 && (
          <div className="py-12 text-center text-xs text-slate-400">
            No rooms matching &ldquo;{searchQuery}&rdquo; on this floor
          </div>
        )}
      </div>
    </div>
  );
};
