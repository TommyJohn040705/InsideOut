import React from 'react';
import { ExternalLink, Navigation, MapPin, X, ArrowRight, Compass } from 'lucide-react';
import { RoomPOI } from '../types/navigation';

interface Props {
  open: boolean;
  onClose: () => void;
  targetDestination: RoomPOI | null;
  onSelectEntrance: (entranceRoomId: string, floor: number) => void;
  onHeadingToE5?: () => void;
}

export function GoogleMapsHandoffModal({ open, onClose, targetDestination, onSelectEntrance, onHeadingToE5 }: Props) {
  if (!open) return null;

  // University of Waterloo Engineering 5 coordinates
  const E5_LAT = 43.47291;
  const E5_LNG = -80.54011;
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${E5_LAT},${E5_LNG}&travelmode=walking`;

  const handleOpenGoogleMaps = () => {
    onHeadingToE5?.();
    window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <Compass className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-slate-900 text-base">Outdoor to Indoor Handoff</h3>
            <p className="text-xs text-slate-500">Google Maps outdoor navigation to Engineering 5</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {targetDestination && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-blue-700 font-bold uppercase tracking-wider">Indoor Target Preserved</p>
                <p className="text-sm font-extrabold text-blue-950 truncate">
                  E5 {targetDestination.roomNumber || ''} · {targetDestination.name}
                </p>
                <p className="text-xs text-blue-600">Level {targetDestination.floor || 2}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm text-slate-700 leading-relaxed">
              Google Maps provides turn-by-turn outdoor directions to the <b>University of Waterloo Engineering 5 (E5)</b> building entrance. Once you arrive at the doors, FloorNav takes over with indoor room wayfinding.
            </p>
            <button
              onClick={handleOpenGoogleMaps}
              className="w-full h-12 rounded-xl bg-slate-900 hover:bg-black text-white font-bold flex items-center justify-center gap-2 shadow transition-colors"
            >
              <Navigation className="w-4 h-4 fill-current text-blue-400" />
              <span>Open in Google Maps</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Opens Google Maps in a new tab with destination set to Waterloo E5 (43.4729° N, 80.5401° W).
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Already at the building? Choose your entrance:
            </p>

            <button
              onClick={() => {
                onSelectEntrance('e5-2811', 2);
                onClose();
              }}
              className="w-full text-left p-3.5 rounded-2xl ring-1 ring-slate-200 hover:ring-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-between group"
            >
              <div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-blue-900">
                  Main Campus Entrance (Level 2)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ramped bridge from Davis Centre / Ring Road (Wheelchair Accessible)
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
            </button>

            <button
              onClick={() => {
                onSelectEntrance('e5-1816', 1);
                onClose();
              }}
              className="w-full text-left p-3.5 rounded-2xl ring-1 ring-slate-200 hover:ring-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-between group"
            >
              <div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-blue-900">
                  East Ground Entrance & Concourse (Level 1)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ground-level access near loading concourse & East Ring Road
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
